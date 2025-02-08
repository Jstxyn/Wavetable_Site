from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import os
import numpy as np
from io import BytesIO
import wave
import struct

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": [
            "http://localhost:5173",
            "https://wavetable-site.vercel.app",
            "https://*.vercel.app"  # Allow all Vercel preview deployments
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

def generate_waveform(equation, num_samples=256):
    t = np.linspace(0, 2*np.pi, num_samples)
    try:
        # Replace 't' in the equation with the actual values
        equation = equation.replace('t', 'x')
        # Safely evaluate the equation
        waveform = eval(equation, {'x': t, 'np': np, 'sin': np.sin, 'cos': np.cos, 'pi': np.pi})
        # Normalize between -1 and 1
        waveform = np.clip(waveform, -1, 1)
        return waveform.tolist()
    except Exception as e:
        print(f"Error generating waveform: {e}")
        return None

@app.route("/")
def home():
    return jsonify({
        "status": "ok",
        "message": "Wavetable API is running"
    })

@app.route("/health")
def health_check():
    return jsonify({
        "status": "healthy",
        "message": "Wavetable API is running"
    })

@app.route("/api/waveform", methods=['POST'])
def create_waveform():
    try:
        data = request.get_json()
        equation = data.get('equation', 'sin(t)')
        num_frames = int(data.get('frames', 256))
        
        waveform = generate_waveform(equation, num_frames)
        if waveform is None:
            return jsonify({"error": "Failed to generate waveform"}), 400
            
        frames = []
        for i in range(num_frames):
            frame = generate_waveform(equation, num_frames)
            if frame is None:
                return jsonify({"error": "Failed to generate frame"}), 400
            frames.append(frame)
            
        return jsonify({
            "waveform": waveform,
            "frames": frames,
            "frame_size": num_frames,
            "num_frames": num_frames,
            "type": "custom",
            "equation": equation
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/waveform/download", methods=['POST'])
def download_waveform():
    try:
        data = request.get_json()
        waveform = data.get('waveform', [])
        
        # Create WAV file in memory
        buffer = BytesIO()
        wav_file = wave.open(buffer, 'wb')
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 2 bytes per sample
        wav_file.setframerate(44100)  # Standard sample rate
        
        # Convert float waveform to 16-bit PCM
        pcm_data = [int(sample * 32767) for sample in waveform]
        wav_data = struct.pack('<%dh' % len(pcm_data), *pcm_data)
        wav_file.writeframes(wav_data)
        wav_file.close()
        
        # Prepare the buffer for sending
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype='audio/wav',
            as_attachment=True,
            download_name='waveform.wav'
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
