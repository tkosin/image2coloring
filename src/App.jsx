import { useState, useEffect, useRef } from 'react'
import { Camera, Download, Terminal, X, Settings, Printer, Sparkles, Plus, Upload } from 'lucide-react'
import './App.css'

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null) // Processed output
  const originalCanvasRef = useRef(null) // Original video
  const logContentRef = useRef(null)
  const galleryRef = useRef(null)
  const fileInputRef = useRef(null)
  const [streaming, setStreaming] = useState(false)
  const [opencvReady, setOpencvReady] = useState(false)
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')
  const [gallery, setGallery] = useState([])
  const [logs, setLogs] = useState([])
  const [showSidebar, setShowSidebar] = useState(false) // Sidebar visibility
  const [sidebarTab, setSidebarTab] = useState('settings') // Active tab: 'settings' or 'logs'
  const [hoveredImage, setHoveredImage] = useState(null) // Track hovered image
  const [loading, setLoading] = useState(true)
  const [retouchModal, setRetouchModal] = useState(null) // {original, enhanced, status, progress}
  const [convertPrompt, setConvertPrompt] = useState(
    "convert the image into a cartoon wireframe for kids' painting with white background"
  )
  const [retouchPrompt, setRetouchPrompt] = useState(
    "Analyze this coloring book line art image. Identify issues like: broken lines, noise, uneven line thickness, or unclear edges. Suggest processing techniques from: denoise, sharpen, connect_lines, smooth_edges. Reply with only comma-separated keywords."
  )
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    // Load API key from localStorage or use environment variable as fallback
    return localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || ''
  })
  const animationIdRef = useRef(null)
  const frameCountRef = useRef(0)

  // Save API key to localStorage when it changes
  useEffect(() => {
    if (geminiApiKey) {
      localStorage.setItem('gemini_api_key', geminiApiKey)
    }
  }, [geminiApiKey])

  // Handle API key change
  const handleApiKeyChange = (e) => {
    const newKey = e.target.value.trim()
    setGeminiApiKey(newKey)
    if (newKey) {
      addLog('🔑 Gemini API key updated', 'success')
    }
  }

  // Processing parameters
  const [params, setParams] = useState({
    // Bilateral filter
    bilateralD: 9,
    bilateralSigmaColor: 75,
    bilateralSigmaSpace: 75,
    // Median Blur
    medianBlurKsize: 5,
    // Gaussian Blur
    gaussianBlurKsize: 5,
    gaussianSigma: 0,
    // Adaptive threshold
    thresholdBlockSize: 25,
    thresholdC: 10,
    // Morphological operations
    kernelSize: 3,
    dilationIterations: 2,
    erosionIterations: 1,
    // Processing toggles - all disabled by default
    useBilateralFilter: false,
    useMedianBlur: false,
    useGaussianBlur: false,
    useMorphClose: false,
    useDilation: false,
    useErosion: false
  })

  // Logger function
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, { message, type, timestamp }])
  }

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight
    }
  }, [logs])

  // Get available cameras
  useEffect(() => {
    const getCameras = async () => {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ video: true })

        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(device => device.kind === 'videoinput')

        addLog(`📹 Found ${videoDevices.length} camera(s)`, 'success')
        setCameras(videoDevices)

        // Select first camera by default
        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId)
          addLog(`✅ Selected: ${videoDevices[0].label || 'Camera 1'}`)
        }
      } catch (err) {
        addLog(`❌ Error getting cameras: ${err.message}`, 'error')
      }
    }

    getCameras()
  }, [])

  // Initialize OpenCV
  useEffect(() => {
    addLog('🚀 App started - Waiting for OpenCV.js to load...')

    let checkCount = 0
    const MAX_CHECKS = 100 // 10 seconds max

    const checkOpenCV = () => {
      checkCount++

      if (typeof window.cv !== 'undefined') {
        if (window.cv.getBuildInformation) {
          const buildInfo = window.cv.getBuildInformation()
          addLog('✅ OpenCV.js loaded successfully', 'success')
          addLog(`📦 OpenCV version: ${buildInfo.split('\n')[0]}`)
          setOpencvReady(true)
          setLoading(false)
          return
        } else if (window.cv.onRuntimeInitialized) {
          addLog('⏳ OpenCV found but waiting for initialization...')
          window.cv.onRuntimeInitialized = () => {
            addLog('✅ OpenCV.js initialized!', 'success')
            setOpencvReady(true)
            setLoading(false)
          }
          return
        }
      }

      if (checkCount >= MAX_CHECKS) {
        addLog('❌ OpenCV.js failed to load after 10 seconds', 'error')
        addLog('💡 Try refreshing the page', 'warning')
        setLoading(false)
        return
      }

      if (checkCount % 10 === 0) {
        addLog(`⏳ Still waiting for OpenCV.js... (${checkCount}/100)`)
      }

      setTimeout(checkOpenCV, 100)
    }

    // Set up global callback for OpenCV
    window.onOpenCVReady = () => {
      addLog('✅ OpenCV.js ready via callback!', 'success')
      setOpencvReady(true)
      setLoading(false)
    }

    checkOpenCV()

    return () => {
      delete window.onOpenCVReady
    }
  }, [])

  // Initialize camera
  useEffect(() => {
    if (!opencvReady || !selectedCamera) {
      if (!opencvReady) {
        addLog('⏳ Waiting for OpenCV to be ready...', 'warning')
      }
      return
    }

    let isSubscribed = true

    const initCamera = async () => {
      const cameraLabel = cameras.find(c => c.deviceId === selectedCamera)?.label || 'Selected camera'
      addLog(`🎥 Initializing camera: ${cameraLabel}`)

      // Stop existing tracks first
      if (videoRef.current?.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks()
        tracks.forEach(track => {
          track.stop()
          addLog('🛑 Stopped existing camera track')
        })
        videoRef.current.srcObject = null
      }

      try {
        const constraints = {
          video: {
            deviceId: { exact: selectedCamera },
            aspectRatio: { ideal: 16/9, min: 1.3 }, // Force landscape (min 1.3 = at least 4:3)
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, max: 720 },
            facingMode: 'user' // Prefer front camera
          }
        }

        addLog('📸 Requesting camera access...')
        const stream = await navigator.mediaDevices.getUserMedia(constraints)

        if (!isSubscribed) return

        addLog('✅ Camera access granted', 'success')

        if (videoRef.current) {
          videoRef.current.srcObject = stream

          videoRef.current.onloadedmetadata = () => {
            if (!isSubscribed) return
            addLog(`📹 Video metadata loaded: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`, 'success')
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth
              canvasRef.current.height = videoRef.current.videoHeight
            }
            if (originalCanvasRef.current) {
              originalCanvasRef.current.width = videoRef.current.videoWidth
              originalCanvasRef.current.height = videoRef.current.videoHeight
            }
            setStreaming(true)
            addLog('🎬 Starting video processing...', 'success')
          }

          // Play the video
          videoRef.current.play().catch(err => {
            addLog(`⚠️ Video play error: ${err.message}`, 'warning')
          })
        }
      } catch (err) {
        if (isSubscribed) {
          addLog(`❌ Camera error: ${err.message}`, 'error')
        }
      }
    }

    initCamera()

    return () => {
      isSubscribed = false
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop())
      }
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      setStreaming(false)
    }
  }, [opencvReady, selectedCamera, cameras])

  // Process video frames
  useEffect(() => {
    if (!streaming || !opencvReady) {
      return
    }

    // Double check OpenCV is really ready
    if (typeof window.cv === 'undefined' || !window.cv.Mat) {
      addLog(`❌ OpenCV.js not loaded properly!`, 'error')
      return
    }

    addLog('🎬 Starting video processing loop...', 'success')
    let errorCount = 0
    const MAX_ERRORS = 5

    const processVideo = () => {
      if (!streaming || !opencvReady) {
        return
      }

      // Stop if too many errors
      if (errorCount >= MAX_ERRORS) {
        addLog(`❌ Too many errors, stopping processing`, 'error')
        return
      }

      try {
        const video = videoRef.current
        const canvas = canvasRef.current
        const originalCanvas = originalCanvasRef.current

        if (!video || !canvas || !originalCanvas) {
          animationIdRef.current = requestAnimationFrame(processVideo)
          return
        }

        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
          animationIdRef.current = requestAnimationFrame(processVideo)
          return
        }

        // Check OpenCV is available
        if (typeof window.cv === 'undefined' || !window.cv.Mat) {
          addLog(`❌ OpenCV.js became unavailable`, 'error')
          errorCount++
          return
        }

        // Log every 30 frames (roughly once per second at 30fps)
        if (frameCountRef.current === 0) {
          addLog('🎨 Processing frame...')
        }
        frameCountRef.current = (frameCountRef.current + 1) % 30

        // Draw original video to originalCanvas
        const originalCtx = originalCanvas.getContext('2d')
        originalCtx.drawImage(video, 0, 0, originalCanvas.width, originalCanvas.height)

        // Create a temporary canvas to draw video frame for processing
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = video.videoWidth
        tempCanvas.height = video.videoHeight
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height)

        // Create matrices for processing
        const src = window.cv.imread(tempCanvas)
        const dst = new window.cv.Mat()
        const gray = new window.cv.Mat()
        const blurred = new window.cv.Mat()
        const thresh = new window.cv.Mat()
        const closed = new window.cv.Mat()

        // Convert to grayscale
        window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY)

        // Apply noise reduction filters (optional)
        let processedGray = gray.clone()

        // Bilateral filter - reduces noise but keeps edges sharp
        if (params.useBilateralFilter) {
          const bilateral = new window.cv.Mat()
          window.cv.bilateralFilter(
            processedGray,
            bilateral,
            params.bilateralD,
            params.bilateralSigmaColor,
            params.bilateralSigmaSpace
          )
          processedGray.delete()
          processedGray = bilateral
        }

        // Median Blur - removes salt-and-pepper noise
        if (params.useMedianBlur) {
          const median = new window.cv.Mat()
          // Ksize must be odd
          const ksize = params.medianBlurKsize % 2 === 0
            ? params.medianBlurKsize + 1
            : params.medianBlurKsize
          window.cv.medianBlur(processedGray, median, ksize)
          processedGray.delete()
          processedGray = median
        }

        // Gaussian Blur - smooth noise reduction
        if (params.useGaussianBlur) {
          const gaussian = new window.cv.Mat()
          // Ksize must be odd
          const ksize = params.gaussianBlurKsize % 2 === 0
            ? params.gaussianBlurKsize + 1
            : params.gaussianBlurKsize
          window.cv.GaussianBlur(
            processedGray,
            gaussian,
            new window.cv.Size(ksize, ksize),
            params.gaussianSigma
          )
          processedGray.delete()
          processedGray = gaussian
        }

        processedGray.copyTo(blurred)
        processedGray.delete()

        // Apply adaptive threshold for coloring book effect
        // blockSize must be odd and >= 3
        const blockSize = params.thresholdBlockSize % 2 === 0
          ? params.thresholdBlockSize + 1
          : params.thresholdBlockSize
        window.cv.adaptiveThreshold(
          blurred,
          thresh,
          255,
          window.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          window.cv.THRESH_BINARY,
          blockSize,
          params.thresholdC
        )

        // Apply morphological closing to connect lines
        const kernel = window.cv.getStructuringElement(
          window.cv.MORPH_ELLIPSE,
          new window.cv.Size(params.kernelSize, params.kernelSize)
        )

        if (params.useMorphClose) {
          window.cv.morphologyEx(thresh, closed, window.cv.MORPH_CLOSE, kernel)
        } else {
          thresh.copyTo(closed)
        }

        // Apply erosion to thin lines (optional)
        let morphResult = closed.clone()
        if (params.useErosion) {
          const eroded = new window.cv.Mat()
          window.cv.erode(morphResult, eroded, kernel, new window.cv.Point(-1, -1), params.erosionIterations)
          morphResult.delete()
          morphResult = eroded
        }

        // Apply dilation to thicken lines (optional)
        if (params.useDilation) {
          const dilated = new window.cv.Mat()
          window.cv.dilate(morphResult, dilated, kernel, new window.cv.Point(-1, -1), params.dilationIterations)
          morphResult.delete()
          morphResult = dilated
        }

        morphResult.copyTo(dst)
        morphResult.delete()

        // Display the result
        window.cv.imshow(canvas, dst)

        // Clean up kernel
        kernel.delete()

        // Clean up
        src.delete()
        dst.delete()
        gray.delete()
        blurred.delete()
        thresh.delete()
        closed.delete()

        // Reset error count on success
        errorCount = 0
      } catch (err) {
        errorCount++
        addLog(`❌ Processing error: ${err.message || err}`, 'error')
      }

      // Request next frame
      animationIdRef.current = requestAnimationFrame(processVideo)
    }

    processVideo()

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
        addLog('🛑 Stopped video processing loop')
      }
    }
  }, [streaming, opencvReady, params])

  // Handle camera selection change
  const handleCameraChange = (e) => {
    const newCameraId = e.target.value
    const cameraLabel = cameras.find(c => c.deviceId === newCameraId)?.label || 'Selected camera'
    addLog(`🔄 Switching to: ${cameraLabel}`)
    setSelectedCamera(newCameraId)
  }

  // Capture image
  const handleCapture = () => {
    addLog('📷 Capture button clicked')
    try {
      const processedCanvas = canvasRef.current
      const originalCanvas = originalCanvasRef.current

      if (!processedCanvas || !originalCanvas) return

      const processedData = processedCanvas.toDataURL('image/png')
      const originalData = originalCanvas.toDataURL('image/png')
      const timestamp = Date.now()

      addLog('✅ Images captured successfully (Original + Processed)', 'success')

      // Add both images to gallery as separate items
      setGallery(prev => [
        {
          id: timestamp + 1,
          data: processedData,
          type: 'coloring',
          timestamp: timestamp + 1
        },
        {
          id: timestamp,
          data: originalData,
          type: 'original',
          timestamp
        },
        ...prev
      ])
    } catch (err) {
      addLog(`❌ Capture error: ${err.message}`, 'error')
    }
  }

  // Print image
  const handlePrintImage = (image) => {
    addLog('🖨️ Opening print dialog...')

    // Check if popup was blocked
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      addLog('❌ Pop-up blocked! Please allow pop-ups for this site.', 'error')
      alert('Please allow pop-ups to print images')
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Coloring Page</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: white;
            }
            img {
              max-width: 100%;
              max-height: 100vh;
              display: block;
            }
            @media print {
              body { margin: 0; }
              img {
                max-width: 100%;
                height: auto;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <img src="${image.data}" id="printImage" />
          <script>
            // Wait for image to load, then print
            var img = document.getElementById('printImage');
            img.onload = function() {
              setTimeout(function() {
                window.print();
                // Close after print dialog is dismissed (for desktop browsers)
                // Don't close on Safari mobile as it causes issues
                setTimeout(function() {
                  try {
                    window.close();
                  } catch (e) {
                    console.log('Could not auto-close window');
                  }
                }, 100);
              }, 500);
            };

            // If image is already cached and loaded
            if (img.complete) {
              setTimeout(function() {
                window.print();
                setTimeout(function() {
                  try {
                    window.close();
                  } catch (e) {
                    console.log('Could not auto-close window');
                  }
                }, 100);
              }, 500);
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
    addLog('✅ Print window opened', 'success')
  }

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    addLog('📤 File selected: ' + file.name)

    try {
      // Read file as data URL
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const imageData = e.target.result
          addLog('✅ File loaded successfully')

          // Add original image to gallery
          const timestamp = Date.now()
          setGallery(prev => [{
            id: timestamp,
            data: imageData,
            type: 'original',
            timestamp,
            uploaded: true
          }, ...prev])

          addLog('📸 Image added to gallery. Click "AI Convert" to process it.', 'success')
        } catch (err) {
          addLog(`❌ Error processing file: ${err.message}`, 'error')
        }
      }

      reader.onerror = () => {
        addLog('❌ Failed to read file', 'error')
      }

      reader.readAsDataURL(file)
    } catch (err) {
      addLog(`❌ Upload error: ${err.message}`, 'error')
    }

    // Reset input so the same file can be selected again
    event.target.value = ''
  }

  // Apply advanced OpenCV processing based on Gemini suggestions
  const applyAdvancedProcessing = (imageData, suggestions, removeBackground = false) => {
    return new Promise((resolve, reject) => {
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error('Processing timeout - image too large or complex'))
      }, 30000) // 30 second timeout

      try {
        addLog('🔧 Applying advanced processing...')
        if (removeBackground) {
          addLog('🎯 Background removal enabled')
        }

        // Create temp canvas from image data
        const img = new Image()
        img.onload = () => {
          try {
            const tempCanvas = document.createElement('canvas')

            // Resize if image is too large (for faster processing)
            const maxSize = 1024
            let width = img.width
            let height = img.height

            if (width > maxSize || height > maxSize) {
              if (width > height) {
                height = (height / width) * maxSize
                width = maxSize
              } else {
                width = (width / height) * maxSize
                height = maxSize
              }
              addLog(`📏 Resizing to ${Math.round(width)}x${Math.round(height)} for faster processing`)
            }

            tempCanvas.width = width
            tempCanvas.height = height
            const tempCtx = tempCanvas.getContext('2d')
            tempCtx.drawImage(img, 0, 0, width, height)

            // Process with OpenCV
            const src = window.cv.imread(tempCanvas)
            let processingSrc = src.clone()

            // Background removal using improved edge detection
            if (removeBackground) {
              try {
                addLog('🖼️ Removing background...')

                // Convert to grayscale for processing
                const gray = new window.cv.Mat()
                window.cv.cvtColor(processingSrc, gray, window.cv.COLOR_RGBA2GRAY)

                // Apply bilateral filter to smooth while preserving edges
                const bilateral = new window.cv.Mat()
                window.cv.bilateralFilter(gray, bilateral, 9, 75, 75)

                // Use Canny edge detection to find strong edges
                const edges = new window.cv.Mat()
                window.cv.Canny(bilateral, edges, 50, 150)

                // Dilate edges to create thicker lines for better mask
                const kernel = window.cv.getStructuringElement(
                  window.cv.MORPH_ELLIPSE,
                  new window.cv.Size(3, 3)
                )
                const dilatedEdges = new window.cv.Mat()
                window.cv.dilate(edges, dilatedEdges, kernel, new window.cv.Point(-1, -1), 2)

                // Find contours to identify main subject
                const contours = new window.cv.MatVector()
                const hierarchy = new window.cv.Mat()
                window.cv.findContours(
                  dilatedEdges,
                  contours,
                  hierarchy,
                  window.cv.RETR_EXTERNAL,
                  window.cv.CHAIN_APPROX_SIMPLE
                )

                // Create mask and fill largest contours (main subject)
                const mask = window.cv.Mat.zeros(height, width, window.cv.CV_8UC1)

                // Find largest contours by area
                const contourAreas = []
                for (let i = 0; i < contours.size(); i++) {
                  const area = window.cv.contourArea(contours.get(i))
                  contourAreas.push({ index: i, area })
                }
                contourAreas.sort((a, b) => b.area - a.area)

                // Fill top contours (main subjects)
                const numContoursToKeep = Math.min(3, contourAreas.length)
                for (let i = 0; i < numContoursToKeep; i++) {
                  const idx = contourAreas[i].index
                  window.cv.drawContours(
                    mask,
                    contours,
                    idx,
                    [255, 255, 255, 255],
                    window.cv.FILLED
                  )
                }

                // Morphological operations to clean up mask
                const closingKernel = window.cv.getStructuringElement(
                  window.cv.MORPH_ELLIPSE,
                  new window.cv.Size(15, 15)
                )
                const closedMask = new window.cv.Mat()
                window.cv.morphologyEx(mask, closedMask, window.cv.MORPH_CLOSE, closingKernel, new window.cv.Point(-1, -1), 3)

                // Apply Gaussian blur to soften mask edges
                const smoothMask = new window.cv.Mat()
                window.cv.GaussianBlur(closedMask, smoothMask, new window.cv.Size(21, 21), 0)

                // Apply mask to original image
                const foreground = new window.cv.Mat()
                processingSrc.copyTo(foreground)

                // Replace background with white
                for (let i = 0; i < height; i++) {
                  for (let j = 0; j < width; j++) {
                    const maskValue = smoothMask.ucharPtr(i, j)[0]
                    if (maskValue < 128) { // Background
                      foreground.ucharPtr(i, j)[0] = 255
                      foreground.ucharPtr(i, j)[1] = 255
                      foreground.ucharPtr(i, j)[2] = 255
                      foreground.ucharPtr(i, j)[3] = 255
                    }
                  }
                }

                processingSrc.delete()
                processingSrc = foreground

                // Clean up
                gray.delete()
                bilateral.delete()
                edges.delete()
                kernel.delete()
                dilatedEdges.delete()
                contours.delete()
                hierarchy.delete()
                mask.delete()
                closingKernel.delete()
                closedMask.delete()
                smoothMask.delete()

                addLog('✓ Background removed with edge detection')
              } catch (bgErr) {
                addLog(`⚠️ Background removal failed, proceeding without it: ${bgErr.message}`, 'warning')
              }
            }

            const gray = new window.cv.Mat()

            // Convert to grayscale
            window.cv.cvtColor(processingSrc, gray, window.cv.COLOR_RGBA2GRAY)

            let processed = gray.clone()

            // 1. Apply bilateral filter to reduce noise while preserving edges
            const bilateral = new window.cv.Mat()
            window.cv.bilateralFilter(processed, bilateral, 9, 75, 75)
            processed.delete()
            processed = bilateral
            addLog('✓ Applied bilateral filter')

            // 2. Use Canny edge detection for bold lines
            const cannyEdges = new window.cv.Mat()
            if (suggestions.includes('edge_detect') || suggestions.includes('bold_lines')) {
              // Lower thresholds for more details
              window.cv.Canny(processed, cannyEdges, 30, 100)
              addLog('✓ Applied Canny edge detection')
            } else {
              // Use adaptive threshold as fallback
              window.cv.adaptiveThreshold(
                processed,
                cannyEdges,
                255,
                window.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                window.cv.THRESH_BINARY,
                11,
                2
              )
              addLog('✓ Applied adaptive threshold')
            }

            // 3. Invert if needed (Canny gives white lines on black, we want black on white)
            const inverted = new window.cv.Mat()
            window.cv.bitwise_not(cannyEdges, inverted)

            // 4. Dilate to make lines thicker/bolder
            const thickenKernel = window.cv.getStructuringElement(
              window.cv.MORPH_ELLIPSE,
              new window.cv.Size(2, 2)
            )
            const thickened = new window.cv.Mat()
            const dilationAmount = suggestions.includes('bold_lines') ? 2 : 1
            window.cv.dilate(inverted, thickened, thickenKernel, new window.cv.Point(-1, -1), dilationAmount)
            addLog(`✓ Thickened lines (${dilationAmount}x)`)

            // 5. Morphological closing to connect broken lines
            let finalThickened = thickened
            if (suggestions.includes('connect_lines')) {
              const connectKernel = window.cv.getStructuringElement(
                window.cv.MORPH_ELLIPSE,
                new window.cv.Size(3, 3)
              )
              const connected = new window.cv.Mat()
              window.cv.morphologyEx(thickened, connected, window.cv.MORPH_CLOSE, connectKernel)
              finalThickened = connected
              thickened.delete()
              connectKernel.delete()
              addLog('✓ Connected lines')
            }

            // 6. Remove small noise with opening operation
            const cleanKernel = window.cv.getStructuringElement(
              window.cv.MORPH_ELLIPSE,
              new window.cv.Size(2, 2)
            )
            const cleaned = new window.cv.Mat()
            window.cv.morphologyEx(finalThickened, cleaned, window.cv.MORPH_OPEN, cleanKernel)
            addLog('✓ Removed noise')

            // Output to canvas
            const outputCanvas = document.createElement('canvas')
            outputCanvas.width = width
            outputCanvas.height = height
            window.cv.imshow(outputCanvas, cleaned)

            // Clean up
            src.delete()
            processingSrc.delete()
            gray.delete()
            processed.delete()
            cannyEdges.delete()
            inverted.delete()
            thickenKernel.delete()
            finalThickened.delete()
            cleanKernel.delete()
            cleaned.delete()

            clearTimeout(timeout)
            const enhancedData = outputCanvas.toDataURL('image/png')
            addLog('✅ Processing complete!', 'success')
            resolve(enhancedData)
          } catch (err) {
            clearTimeout(timeout)
            addLog(`❌ Processing error: ${err.message}`, 'error')
            reject(err)
          }
        }

        img.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('Failed to load image'))
        }
        img.src = imageData
      } catch (err) {
        clearTimeout(timeout)
        addLog(`❌ Processing error: ${err.message}`, 'error')
        reject(err)
      }
    })
  }

  // Retouch with AI
  const handleRetouchImage = async (image) => {
    const isConvert = image.type === 'original'
    addLog(isConvert ? '🎨 Starting AI Convert...' : '🎨 Starting AI Retouch...')

    try {
      // Show modal with loading state
      setRetouchModal({
        original: image.data,
        enhanced: null,
        status: 'analyzing',
        progress: 10,
        isConvert
      })

      // Get Gemini API key from state
      const apiKey = geminiApiKey
      if (!apiKey) {
        throw new Error('Gemini API key not found. Please add your API key in Settings.')
      }

      // Use Gemini Image Generation for ALL original images (uploaded OR captured)
      if (isConvert) {
        addLog('🎨 Using Gemini Image Generation API...')
        addLog(image.uploaded ? '📤 Source: Uploaded photo' : '📸 Source: Captured from webcam')
        setRetouchModal(prev => ({ ...prev, progress: 30 }))

        // Call Gemini Image Generation API
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: "Transform this image into a bold black-and-white cartoon coloring book page for kids. Remove the background completely (replace with pure white). Create thick, continuous black outlines around the main subject with clear edges. The result should look like a professional children's coloring book page with simple, bold lines on a white background - perfect for printing and coloring."
                  },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: image.data.split(',')[1]
                    }
                  }
                ]
              }]
            })
          }
        )

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Gemini Image API error: ${response.status} - ${errorText}`)
        }

        setRetouchModal(prev => ({ ...prev, progress: 70, status: 'processing' }))
        addLog('🖼️ Generating coloring book image...')

        const data = await response.json()

        // Extract generated image from response
        const parts = data.candidates?.[0]?.content?.parts || []
        let generatedImage = null

        for (const part of parts) {
          if (part.inlineData) {
            generatedImage = `data:image/png;base64,${part.inlineData.data}`
            break
          }
        }

        if (!generatedImage) {
          throw new Error('No image generated from Gemini API')
        }

        setRetouchModal(prev => ({
          ...prev,
          enhanced: generatedImage,
          status: 'complete',
          progress: 100
        }))

        addLog('✨ AI Image Generation complete!', 'success')
      } else {
        // Use OpenCV for webcam captures or retouch mode
        addLog('🤖 Analyzing image with Gemini AI...')
        setRetouchModal(prev => ({ ...prev, progress: 30 }))

        // Select appropriate prompt based on image type
        const selectedPrompt = isConvert ? convertPrompt : retouchPrompt
        addLog(`Using ${isConvert ? 'Convert' : 'Retouch'} prompt`)

        // Call Gemini Vision API
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: selectedPrompt
                  },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: image.data.split(',')[1]
                    }
                  }
                ]
              }]
            })
          }
        )

        if (!response.ok) {
          throw new Error(`Gemini API error: ${response.status}`)
        }

        const data = await response.json()
        const suggestions = data.candidates?.[0]?.content?.parts?.[0]?.text || 'denoise,sharpen'
        addLog(`💡 AI suggests: ${suggestions}`, 'success')

        setRetouchModal(prev => ({ ...prev, progress: 60, status: 'processing' }))
        addLog('🔧 Applying enhancements...')

        // Apply OpenCV processing based on AI suggestions
        // Remove background only for uploaded original images
        const shouldRemoveBackground = isConvert && image.uploaded
        const enhanced = await applyAdvancedProcessing(
          image.data,
          suggestions.split(','),
          shouldRemoveBackground
        )

        setRetouchModal(prev => ({
          ...prev,
          enhanced,
          status: 'complete',
          progress: 100
        }))

        addLog(isConvert ? '✨ AI Convert complete!' : '✨ AI Retouch complete!', 'success')
      }
    } catch (err) {
      addLog(`❌ Retouch error: ${err.message}`, 'error')
      setRetouchModal(prev => ({
        ...prev,
        status: 'error',
        error: err.message
      }))
    }
  }

  // Gallery drag scroll
  useEffect(() => {
    const gallery = galleryRef.current
    if (!gallery) return

    let isDown = false
    let startX
    let scrollLeft

    const handleMouseDown = (e) => {
      isDown = true
      gallery.classList.add('dragging')
      startX = e.pageX - gallery.offsetLeft
      scrollLeft = gallery.scrollLeft
    }

    const handleMouseLeave = () => {
      isDown = false
      gallery.classList.remove('dragging')
    }

    const handleMouseUp = () => {
      isDown = false
      gallery.classList.remove('dragging')
    }

    const handleMouseMove = (e) => {
      if (!isDown) return
      e.preventDefault()
      const x = e.pageX - gallery.offsetLeft
      const walk = (x - startX) * 2
      gallery.scrollLeft = scrollLeft - walk
    }

    gallery.addEventListener('mousedown', handleMouseDown)
    gallery.addEventListener('mouseleave', handleMouseLeave)
    gallery.addEventListener('mouseup', handleMouseUp)
    gallery.addEventListener('mousemove', handleMouseMove)

    return () => {
      gallery.removeEventListener('mousedown', handleMouseDown)
      gallery.removeEventListener('mouseleave', handleMouseLeave)
      gallery.removeEventListener('mouseup', handleMouseUp)
      gallery.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading OpenCV.js...</p>
        <p style={{ fontSize: '12px', marginTop: '10px', opacity: 0.7 }}>
          This may take 5-10 seconds...
        </p>
      </div>
    )
  }

  return (
    <div className="app">
      {/* Main Canvas Area */}
      <div className="canvas-container">
        <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
        <div className="dual-canvas">
          <div className="canvas-wrapper">
            <div className="canvas-label">Original</div>
            <canvas ref={originalCanvasRef} className="output-canvas" />
          </div>
          <div className="canvas-wrapper">
            <div className="canvas-label">Coloring Book</div>
            <canvas ref={canvasRef} className="output-canvas" />
          </div>
        </div>
      </div>

      {/* Gallery Warning */}
      {gallery.length > 0 && (
        <div className="gallery-warning">
          ⚠️ Images are stored temporarily. They will be lost when you close the browser.
        </div>
      )}

      {/* Gallery */}
      <div className="gallery" ref={galleryRef}>
        {gallery.map(image => (
          <div
            key={image.id}
            className="gallery-item"
            onMouseEnter={() => setHoveredImage(image.id)}
            onMouseLeave={() => setHoveredImage(null)}
          >
            <img
              src={image.data}
              alt={image.type === 'original' ? 'Original' : 'Coloring Book'}
              className="thumbnail"
            />
            <span className="thumbnail-label">
              {image.type === 'original' ? 'Original' : 'Coloring Book'}
            </span>
            {hoveredImage === image.id && (
              <div className="image-overlay">
                <button
                  className="overlay-btn print-btn"
                  onClick={() => handlePrintImage(image)}
                  title={`Print ${image.type === 'original' ? 'Original' : 'Coloring Book'}`}
                >
                  <Printer size={16} />
                  <span>Print</span>
                </button>
                {image.type === 'original' && (
                  <button
                    className="overlay-btn convert-btn"
                    onClick={() => handleRetouchImage(image)}
                    title="AI Convert to Coloring Book"
                  >
                    <Sparkles size={16} />
                    <span>AI Convert</span>
                  </button>
                )}
                {image.type === 'coloring' && (
                  <button
                    className="overlay-btn retouch-btn"
                    onClick={() => handleRetouchImage(image)}
                    title="AI Retouch"
                  >
                    <Sparkles size={16} />
                    <span>Retouch AI</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="controls">
        <button onClick={handleCapture} className="btn btn-primary">
          <Camera size={20} />
          Capture
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-upload"
        >
          <Upload size={20} />
          Upload Photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="btn btn-secondary"
        >
          <Settings size={20} />
          {showSidebar ? 'Close Panel' : 'Open Panel'}
        </button>
      </div>

      {/* Right Sidebar */}
      {showSidebar && (
        <div className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${sidebarTab === 'settings' ? 'active' : ''}`}
                onClick={() => setSidebarTab('settings')}
              >
                <Settings size={18} />
                Settings
              </button>
              <button
                className={`sidebar-tab ${sidebarTab === 'logs' ? 'active' : ''}`}
                onClick={() => setSidebarTab('logs')}
              >
                <Terminal size={18} />
                Logs
              </button>
            </div>
            <button onClick={() => setShowSidebar(false)} className="sidebar-close">
              <X size={18} />
            </button>
          </div>

          <div className="sidebar-content">
            {/* Settings Tab */}
            {sidebarTab === 'settings' && (
              <>
                {/* Gemini API Key Section */}
                <div className="sidebar-section">
                  <h3 className="section-title">🔑 Gemini API Key</h3>
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={handleApiKeyChange}
                    className="api-key-input"
                    placeholder="Enter your Gemini API key..."
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '13px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      backgroundColor: geminiApiKey ? '#f0fff4' : '#fff'
                    }}
                  />
                  <p className="param-hint" style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                    Get your free API key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: '#4285f4', textDecoration: 'underline' }}>Google AI Studio</a>
                  </p>
                  {!geminiApiKey && (
                    <p className="param-hint" style={{ marginTop: '4px', fontSize: '11px', color: '#dc2626', fontWeight: 'bold' }}>
                      ⚠️ API key required for AI features
                    </p>
                  )}
                </div>

                {/* Camera Selection Section */}
                <div className="sidebar-section camera-section">
                  <h3 className="section-title">Camera</h3>
                  <select
                    value={selectedCamera}
                    onChange={handleCameraChange}
                    className="camera-select"
                    disabled={cameras.length === 0}
                  >
                    {cameras.length === 0 ? (
                      <option value="">No cameras found</option>
                    ) : (
                      cameras.map((camera, index) => (
                        <option key={camera.deviceId} value={camera.deviceId}>
                          {camera.label || `Camera ${index + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Gemini AI Prompts */}
                <div className="sidebar-section">
                  <h3 className="section-title">AI Convert Prompt</h3>
                  <textarea
                    value={convertPrompt}
                    onChange={(e) => setConvertPrompt(e.target.value)}
                    className="gemini-prompt-input"
                    rows={5}
                    placeholder="Enter the prompt for converting photos to coloring books..."
                  />
                  <p className="param-hint" style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                    Used when converting Original photos to Coloring Book style.
                  </p>
                </div>

                <div className="sidebar-section">
                  <h3 className="section-title">AI Retouch Prompt</h3>
                  <textarea
                    value={retouchPrompt}
                    onChange={(e) => setRetouchPrompt(e.target.value)}
                    className="gemini-prompt-input"
                    rows={5}
                    placeholder="Enter the prompt for retouching coloring book images..."
                  />
                  <p className="param-hint" style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                    Used when enhancing existing Coloring Book images.
                  </p>
                </div>

                {/* Noise Reduction Filters */}
                <div className="sidebar-section">
                  <h3 className="section-title">Noise Reduction (Optional)</h3>

                  {/* Bilateral Filter */}
                  <div className="section-header">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={params.useBilateralFilter}
                        onChange={(e) => setParams({...params, useBilateralFilter: e.target.checked})}
                      />
                      Bilateral Filter (Sharp Edges)
                    </label>
                  </div>
                  {params.useBilateralFilter && (
                    <>
                      <div className="param-control">
                        <label>
                          Diameter: <span className="param-value">{params.bilateralD}</span>
                          <span className="param-hint">(filter size)</span>
                        </label>
                        <input
                          type="range"
                          min="3"
                          max="15"
                          step="2"
                          value={params.bilateralD}
                          onChange={(e) => setParams({...params, bilateralD: parseInt(e.target.value)})}
                        />
                      </div>
                      <div className="param-control">
                        <label>
                          Sigma Color: <span className="param-value">{params.bilateralSigmaColor}</span>
                          <span className="param-hint">(color similarity)</span>
                        </label>
                        <input
                          type="range"
                          min="10"
                          max="150"
                          step="5"
                          value={params.bilateralSigmaColor}
                          onChange={(e) => setParams({...params, bilateralSigmaColor: parseInt(e.target.value)})}
                        />
                      </div>
                      <div className="param-control">
                        <label>
                          Sigma Space: <span className="param-value">{params.bilateralSigmaSpace}</span>
                          <span className="param-hint">(spatial influence)</span>
                        </label>
                        <input
                          type="range"
                          min="10"
                          max="150"
                          step="5"
                          value={params.bilateralSigmaSpace}
                          onChange={(e) => setParams({...params, bilateralSigmaSpace: parseInt(e.target.value)})}
                        />
                      </div>
                    </>
                  )}

                  {/* Median Blur */}
                  <div className="section-header">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={params.useMedianBlur}
                        onChange={(e) => setParams({...params, useMedianBlur: e.target.checked})}
                      />
                      Median Blur (Remove Noise)
                    </label>
                  </div>
                  {params.useMedianBlur && (
                    <div className="param-control">
                      <label>
                        Kernel Size: <span className="param-value">{params.medianBlurKsize}</span>
                        <span className="param-hint">(odd numbers only)</span>
                      </label>
                      <input
                        type="range"
                        min="3"
                        max="15"
                        step="2"
                        value={params.medianBlurKsize}
                        onChange={(e) => setParams({...params, medianBlurKsize: parseInt(e.target.value)})}
                      />
                    </div>
                  )}

                  {/* Gaussian Blur */}
                  <div className="section-header">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={params.useGaussianBlur}
                        onChange={(e) => setParams({...params, useGaussianBlur: e.target.checked})}
                      />
                      Gaussian Blur (Smooth)
                    </label>
                  </div>
                  {params.useGaussianBlur && (
                    <>
                      <div className="param-control">
                        <label>
                          Kernel Size: <span className="param-value">{params.gaussianBlurKsize}</span>
                          <span className="param-hint">(odd numbers only)</span>
                        </label>
                        <input
                          type="range"
                          min="3"
                          max="15"
                          step="2"
                          value={params.gaussianBlurKsize}
                          onChange={(e) => setParams({...params, gaussianBlurKsize: parseInt(e.target.value)})}
                        />
                      </div>
                      <div className="param-control">
                        <label>
                          Sigma: <span className="param-value">{params.gaussianSigma}</span>
                          <span className="param-hint">(0 = auto)</span>
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.5"
                          value={params.gaussianSigma}
                          onChange={(e) => setParams({...params, gaussianSigma: parseFloat(e.target.value)})}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Adaptive Threshold */}
                <div className="sidebar-section">
                  <h3 className="section-title">Adaptive Threshold (Line Detection)</h3>
                  <div className="param-control">
                    <label>
                      Block Size: <span className="param-value">{params.thresholdBlockSize}</span>
                      <span className="param-hint">(larger = thicker lines)</span>
                    </label>
                    <input
                      type="range"
                      min="3"
                      max="51"
                      step="2"
                      value={params.thresholdBlockSize}
                      onChange={(e) => setParams({...params, thresholdBlockSize: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="param-control">
                    <label>
                      C Constant: <span className="param-value">{params.thresholdC}</span>
                      <span className="param-hint">(lower = more lines)</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      step="1"
                      value={params.thresholdC}
                      onChange={(e) => setParams({...params, thresholdC: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                {/* Morphological Operations */}
                <div className="sidebar-section">
                  <div className="section-header">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={params.useMorphClose}
                        onChange={(e) => setParams({...params, useMorphClose: e.target.checked})}
                      />
                      Morphological Closing (Connect Lines)
                    </label>
                  </div>
                  <div className="param-control">
                    <label>
                      Kernel Size: <span className="param-value">{params.kernelSize}</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="9"
                      step="2"
                      value={params.kernelSize}
                      onChange={(e) => setParams({...params, kernelSize: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                {/* Line Thickness Adjustment */}
                <div className="sidebar-section">
                  <h3 className="section-title">Line Thickness (Optional)</h3>

                  {/* Erosion */}
                  <div className="section-header">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={params.useErosion}
                        onChange={(e) => setParams({...params, useErosion: e.target.checked})}
                      />
                      Erosion (Thin Lines)
                    </label>
                  </div>
                  {params.useErosion && (
                    <div className="param-control">
                      <label>
                        Iterations: <span className="param-value">{params.erosionIterations}</span>
                        <span className="param-hint">(higher = thinner)</span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={params.erosionIterations}
                        onChange={(e) => setParams({...params, erosionIterations: parseInt(e.target.value)})}
                      />
                    </div>
                  )}

                  {/* Dilation */}
                  <div className="section-header">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={params.useDilation}
                        onChange={(e) => setParams({...params, useDilation: e.target.checked})}
                      />
                      Dilation (Thicken Lines)
                    </label>
                  </div>
                  {params.useDilation && (
                    <div className="param-control">
                      <label>
                        Iterations: <span className="param-value">{params.dilationIterations}</span>
                        <span className="param-hint">(higher = thicker)</span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={params.dilationIterations}
                        onChange={(e) => setParams({...params, dilationIterations: parseInt(e.target.value)})}
                      />
                    </div>
                  )}
                </div>

                {/* Reset Button */}
                <div className="sidebar-footer">
                  <button
                    onClick={() => setParams({
                      // Reset all to default values with all features disabled
                      bilateralD: 9,
                      bilateralSigmaColor: 75,
                      bilateralSigmaSpace: 75,
                      medianBlurKsize: 5,
                      gaussianBlurKsize: 5,
                      gaussianSigma: 0,
                      thresholdBlockSize: 25,
                      thresholdC: 10,
                      kernelSize: 3,
                      dilationIterations: 2,
                      erosionIterations: 1,
                      useBilateralFilter: false,
                      useMedianBlur: false,
                      useGaussianBlur: false,
                      useMorphClose: false,
                      useDilation: false,
                      useErosion: false
                    })}
                    className="btn-reset"
                  >
                    Reset to Default
                  </button>
                </div>
              </>
            )}

            {/* Logs Tab */}
            {sidebarTab === 'logs' && (
              <>
                <div className="logs-container" ref={logContentRef}>
                  {logs.length === 0 ? (
                    <div className="log-empty">No logs yet...</div>
                  ) : (
                    logs.map((log, index) => (
                      <div key={index} className={`log-entry log-${log.type}`}>
                        <span className="log-timestamp">{log.timestamp}</span>
                        <span className="log-message">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="sidebar-footer">
                  <button onClick={() => setLogs([])} className="btn-clear-logs">
                    Clear Logs
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Retouch AI Modal */}
      {retouchModal && (
        <div className="retouch-modal-overlay">
          <div className="retouch-modal">
            <div className="retouch-modal-header">
              <h2>
                <Sparkles size={20} />
                {retouchModal.isConvert ? ' AI Convert' : ' AI Retouch'}
              </h2>
              <button onClick={() => setRetouchModal(null)} className="modal-close">
                <X size={24} />
              </button>
            </div>

            {/* Progress Bar */}
            {retouchModal.status !== 'complete' && retouchModal.status !== 'error' && (
              <div className="retouch-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${retouchModal.progress}%` }}
                  />
                </div>
                <p className="progress-text">
                  {retouchModal.status === 'analyzing' && 'Analyzing with Gemini AI...'}
                  {retouchModal.status === 'processing' && 'Applying enhancements...'}
                </p>
              </div>
            )}

            {/* Error State */}
            {retouchModal.status === 'error' && (
              <div className="retouch-error">
                <p>❌ {retouchModal.error}</p>
                <button onClick={() => setRetouchModal(null)} className="btn-error-close">
                  Close
                </button>
              </div>
            )}

            {/* Complete State - Before/After Comparison */}
            {retouchModal.status === 'complete' && retouchModal.enhanced && (
              <div className="retouch-comparison">
                <div className="comparison-container">
                  <div className="comparison-images">
                    <img src={retouchModal.original} alt="Original" className="comparison-original" />
                    <img src={retouchModal.enhanced} alt="Enhanced" className="comparison-enhanced" />
                  </div>
                  <div className="comparison-labels">
                    <span>{retouchModal.isConvert ? 'Original Photo' : 'Coloring Book'}</span>
                    <span>{retouchModal.isConvert ? 'AI Coloring Book' : 'AI Enhanced'}</span>
                  </div>
                </div>

                <div className="retouch-actions">
                  <button
                    onClick={() => {
                      const link = document.createElement('a')
                      link.href = retouchModal.enhanced
                      link.download = `enhanced-${Date.now()}.png`
                      link.click()
                      addLog('📥 Downloaded enhanced image', 'success')
                    }}
                    className="btn-download-enhanced"
                  >
                    <Download size={16} /> Download Enhanced
                  </button>
                  <button
                    onClick={() => {
                      // Add to gallery
                      setGallery(prev => [{
                        id: Date.now(),
                        data: retouchModal.enhanced,
                        type: 'coloring',
                        timestamp: Date.now()
                      }, ...prev])
                      addLog(retouchModal.isConvert
                        ? '✅ Added converted coloring book to gallery'
                        : '✅ Added enhanced version to gallery', 'success')
                      setRetouchModal(null)
                    }}
                    className="btn-add-gallery"
                  >
                    <Plus size={16} /> Add to Gallery
                  </button>
                  <button
                    onClick={() => setRetouchModal(null)}
                    className="btn-close-modal"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
