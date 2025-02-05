# Wavetable Editor

An advanced web-based wavetable editor for creating and manipulating wavetables for synthesizers.

## Features

- **Interactive Waveform Editor**
  - Real-time 2D waveform visualization
  - 3D wavetable visualization with frame interpolation
  - Custom equation support with advanced mathematical functions
  - Basic waveform presets (sine, square, sawtooth, triangle)

- **Advanced Math Functions**
  - Trigonometric functions: sin, cos, tan, tanh
  - Basic math: abs, sign, exp, log, sqrt
  - Variable support: 't' for time, 'frame' for morphing

- **File Export**
  - WAV file generation
  - 16-bit PCM format
  - 44.1kHz sample rate
  - Compatible with major synthesizers

## Getting Started

1. Install dependencies:
   ```bash
   # Backend
   cd src/backend
   pip install -r requirements.txt

   # Frontend
   cd src/frontend
   npm install
   ```

2. Start the servers:
   ```bash
   # Backend (from src/backend)
   python app.py

   # Frontend (from src/frontend)
   npm run dev
   ```

3. Open http://localhost:5173 in your browser

## Example Equations

Here are some example equations to try:

1. Sine to Square Morph:
   ```
   sin(t) * (1-frame) + sign(sin(t)) * frame
   ```

2. Harmonic Series:
   ```
   sin(t) + 0.5*sin(2*t)*frame + 0.25*sin(4*t)*frame
   ```

3. FM Synthesis:
   ```
   sin(t + 5*sin(3*t)*frame)
   ```

4. Soft Clip Wave:
   ```
   tanh(sin(t) * (1 + 3*frame))
   ```

## Development

The project is built with:
- Frontend: React, TypeScript, Three.js
- Backend: Flask, NumPy

## License

MIT License
