# Advanced Wavetable Editor

A web-based tool for creating, editing, and manipulating wavetables through manual slice-by-slice editing and equation-based waveform generation.

## Setup Instructions

1. Create and activate virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Unix/macOS
# or
.\venv\Scripts\activate  # On Windows
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Project Structure

```
wavetable_ai/
├── src/
│   ├── frontend/     # React frontend code
│   └── backend/      # Flask backend code
├── static/           # Static assets
├── templates/        # HTML templates
├── requirements.txt  # Python dependencies
└── README.md        # This file
```

## Features (In Development)

- Manual Wavetable Editing
- Equation-Based Editing
- Real-Time Visualization
- Frame Navigation & Morphing Preview
- Export Functionality (.wav, .srmwt, .vitaltable)
