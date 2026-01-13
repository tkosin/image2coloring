# Image to Coloring Book

A real-time web application that converts webcam feed or uploaded photos into coloring book style line art using OpenCV.js and Google Gemini AI.

![Banner](public/vry2.png)

## Features

- **Real-time Webcam Processing**: Convert your webcam feed into coloring book style artwork in real-time
- **Photo Upload**: Upload existing photos to convert into coloring book pages
- **AI-Powered Enhancement**: Use Google Gemini AI to:
  - Convert photos to professional coloring book style
  - Enhance and retouch existing line art
  - Remove backgrounds intelligently
- **Adjustable Processing**: Fine-tune OpenCV parameters for custom results
- **Print Ready**: Download and print your creations
- **Gallery Management**: Save and manage your creations in a temporary gallery
- **Multi-Camera Support**: Switch between available cameras (front/back)

## Technologies Used

- **React 18** - UI framework
- **Vite** - Build tool and development server
- **OpenCV.js** - Computer vision and image processing
- **Google Gemini AI** - AI-powered image generation and enhancement
- **Lucide React** - Icon components

## Prerequisites

- Node.js 16+
- npm or yarn
- A webcam (optional, for real-time features)
- Google Gemini API key (for AI features)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/image2coloring.git
cd image2coloring
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

4. Add your Google Gemini API key to the `.env` file:
```
VITE_GEMINI_API_KEY=your_api_key_here
```

To get a Gemini API key:
- Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
- Sign in with your Google account
- Click "Create API Key"
- Copy the key to your `.env` file

## Usage

### Development Mode

Start the development server:
```bash
npm run dev
```

The application will open at `http://localhost:5173`

### Build for Production

Build the application:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## How It Works

### Real-time Processing

1. The application accesses your webcam feed
2. Each frame is processed using OpenCV.js:
   - Convert to grayscale
   - Apply noise reduction filters (optional)
   - Apply adaptive threshold to detect edges
   - Apply morphological operations to clean up lines
   - Invert colors for printable format (black lines on white)
3. The processed output is displayed in real-time

### AI Enhancement

The application uses Google Gemini AI in two modes:

**AI Convert** (for original photos):
- Uses Gemini 2.5 Flash Image Generation API
- Converts photos to professional coloring book style
- Automatically removes backgrounds
- Creates bold, clear outlines

**AI Retouch** (for existing line art):
- Uses Gemini 2.0 Flash Vision API
- Analyzes the image for issues
- Applies targeted OpenCV enhancements
- Improves line quality and clarity

## Features Guide

### Camera Controls
- **Camera Selection**: Choose between available cameras (front/back)
- **Capture**: Take a snapshot of both original and processed frames
- **Upload Photo**: Upload existing photos to convert

### Processing Parameters

The settings panel allows you to adjust:

**Noise Reduction**:
- Bilateral Filter: Reduces noise while preserving edges
- Median Blur: Removes salt-and-pepper noise
- Gaussian Blur: Smooth noise reduction

**Line Detection**:
- Block Size: Controls line detection sensitivity
- C Constant: Adjusts threshold for line detection

**Line Refinement**:
- Morphological Closing: Connects broken lines
- Erosion: Makes lines thinner
- Dilation: Makes lines thicker

### Gallery Features
- **Print**: Open print dialog for any image
- **AI Convert**: Convert original photos to coloring book style
- **AI Retouch**: Enhance existing coloring book images
- **Auto-saved**: Images are stored temporarily in browser

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires modern browser with:
- WebRTC/getUserMedia support
- Canvas API
- ES6+ JavaScript

## Privacy & Security

- All image processing happens locally in your browser
- Images are NOT uploaded to any server (except when using AI features)
- AI features send images to Google Gemini API for processing
- Camera permissions are requested but never stored
- Gallery images are temporary and cleared when you close the browser

## Limitations

- Gallery images are stored in browser memory only
- AI features require internet connection and API key
- Real-time processing performance depends on device capabilities
- Large images may take longer to process with AI features

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- [OpenCV.js](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html) - Computer vision library
- [Google Gemini AI](https://ai.google.dev/) - AI-powered image processing
- [Lucide Icons](https://lucide.dev/) - Beautiful icon set
- [Vite](https://vitejs.dev/) - Lightning fast build tool

## Support

If you encounter any issues or have questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the browser console for error messages

## Author

Built with Claude Code

---

**Note**: This application requires a Google Gemini API key for AI features. The free tier should be sufficient for personal use.
