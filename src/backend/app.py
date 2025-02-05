from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import numpy as np
import tempfile
import os
import struct
import io

app = Flask(__name__)
CORS(app)

def generate_basic_waveform(waveform_type, num_samples=2048):
    """Generate a basic waveform."""
    t = np.linspace(0, 1, num_samples, endpoint=False)
    
    if waveform_type == 'sine':
        return np.sin(2 * np.pi * t)
    elif waveform_type == 'square':
        return np.sign(np.sin(2 * np.pi * t))
    elif waveform_type == 'sawtooth':
        return 2 * (t - np.floor(0.5 + t))
    elif waveform_type == 'triangle':
        return 2 * np.abs(2 * (t - np.floor(0.5 + t))) - 1
    else:
        raise ValueError(f"Unknown waveform type: {waveform_type}")

def evaluate_equation(equation: str, t: np.ndarray, frame: float = 0):
    """Safely evaluate a waveform equation."""
    safe_dict = {
        'sin': lambda x: np.sin(2 * np.pi * x),
        'cos': lambda x: np.cos(2 * np.pi * x),
        'tan': lambda x: np.tan(2 * np.pi * x),
        'abs': np.abs,
        'sign': np.sign,
        'pi': np.pi,
        'exp': np.exp,
        'log': np.log,
        'sqrt': np.sqrt,
        'tanh': lambda x: np.tanh(2 * np.pi * x),
        't': t,
        'frame': frame
    }
    
    try:
        # Replace ^ with ** for Python power operation
        equation = equation.replace('^', '**')
        code = compile(equation, '<string>', 'eval')
        
        # Check for unsafe operations
        for name in code.co_names:
            if name not in safe_dict:
                raise ValueError(f"Function '{name}' is not supported. Supported functions are: sin, cos, tan, abs, sign, exp, log, sqrt, tanh")
        
        result = eval(code, {"__builtins__": {}}, safe_dict)
        return result
    except Exception as e:
        raise ValueError(f"Error evaluating equation: {str(e)}")

def generate_wav_file(frames, sample_rate=44100):
    """Generate a WAV file from wavetable frames."""
    num_frames = len(frames)
    frame_size = len(frames[0])
    
    # Create WAV file in memory
    buffer = io.BytesIO()
    
    # WAV header
    buffer.write(b'RIFF')
    buffer.write(b'\x00\x00\x00\x00')  # File size (filled later)
    buffer.write(b'WAVE')
    
    # Format chunk
    buffer.write(b'fmt ')
    buffer.write(struct.pack('<I', 16))  # Chunk size
    buffer.write(struct.pack('<H', 1))   # Audio format (PCM)
    buffer.write(struct.pack('<H', 1))   # Num channels (mono)
    buffer.write(struct.pack('<I', sample_rate))  # Sample rate
    buffer.write(struct.pack('<I', sample_rate * 2))  # Byte rate
    buffer.write(struct.pack('<H', 2))   # Block align
    buffer.write(struct.pack('<H', 16))  # Bits per sample
    
    # Data chunk
    buffer.write(b'data')
    buffer.write(struct.pack('<I', num_frames * frame_size * 2))  # Data size
    
    # Write frame data
    for frame in frames:
        # Convert float32 [-1, 1] to int16
        samples = (np.array(frame) * 32767).astype(np.int16)
        buffer.write(samples.tobytes())
    
    # Set file size in header
    file_size = buffer.tell()
    buffer.seek(4)
    buffer.write(struct.pack('<I', file_size - 8))
    
    buffer.seek(0)
    return buffer

def enhance_harmonics(waveform, strength):
    """Enhance harmonics with formant-like filtering."""
    # Convert to frequency domain
    spectrum = np.fft.rfft(waveform)
    freqs = np.arange(len(spectrum))
    
    # Create formant-like filter
    center_freq = len(spectrum) // 4  # Center frequency around 1/4 of Nyquist
    bandwidth = len(spectrum) // 8
    
    # Create resonant peak
    formant = np.exp(-((freqs - center_freq) ** 2) / (2 * bandwidth ** 2))
    
    # Add secondary formants for richer sound
    formant2 = 0.5 * np.exp(-((freqs - center_freq * 2) ** 2) / (2 * (bandwidth * 1.5) ** 2))
    formant3 = 0.25 * np.exp(-((freqs - center_freq * 3) ** 2) / (2 * (bandwidth * 2) ** 2))
    
    # Combine formants
    filter_response = 1 + strength * (formant + formant2 + formant3)
    
    # Apply filter
    enhanced_spectrum = spectrum * filter_response
    
    # Convert back to time domain
    enhanced_waveform = np.fft.irfft(enhanced_spectrum)
    
    # Normalize
    if np.any(enhanced_waveform):
        enhanced_waveform = enhanced_waveform / np.max(np.abs(enhanced_waveform))
    
    return enhanced_waveform.tolist()

@app.route('/api/waveform/equation', methods=['POST'])
def generate_from_equation():
    """Generate wavetable from equation."""
    try:
        data = request.get_json()
        equation = data.get('equation', '')
        num_frames = int(data.get('frames', 8))
        frame_size = 2048
        
        frames = []
        t = np.linspace(0, 1, frame_size, endpoint=False)
        max_amplitude = 0
        
        # First pass: generate all frames and find global max amplitude
        for i in range(num_frames):
            frame_value = i / (num_frames - 1) if num_frames > 1 else 0
            waveform = evaluate_equation(equation, t, frame_value)
            frames.append(waveform)
            max_amplitude = max(max_amplitude, np.max(np.abs(waveform)))
        
        # Second pass: normalize all frames by the global max amplitude
        if max_amplitude > 0:
            frames = [frame / max_amplitude for frame in frames]
        
        frames_list = [frame.tolist() for frame in frames]
        
        response = {
            'waveform': frames_list[0],
            'frames': frames_list,
            'frame_size': frame_size,
            'num_frames': num_frames,
            'spectrum': np.abs(np.fft.rfft(frames_list[0])).tolist()
        }
        
        return jsonify(response)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/waveform/basic', methods=['GET'])
def get_basic_waveform():
    """Generate basic waveform."""
    try:
        waveform_type = request.args.get('type', 'sine')
        frame_size = 2048
        num_frames = int(request.args.get('frames', '8'))
        
        # Generate the base waveform
        base_waveform = generate_basic_waveform(waveform_type, frame_size)
        
        # Create identical frames (no morphing)
        frames = [base_waveform.tolist() for _ in range(num_frames)]
        
        response = {
            'waveform': frames[0],
            'frames': frames,
            'frame_size': frame_size,
            'num_frames': num_frames,
            'spectrum': np.abs(np.fft.rfft(frames[0])).tolist(),
            'type': waveform_type
        }
        
        return jsonify(response)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/waveform/download', methods=['POST'])
def download_waveform():
    """Generate and download wavetable as WAV file."""
    try:
        data = request.get_json()
        frames = data.get('frames', [])
        
        if not frames:
            raise ValueError("No frame data provided")
        
        wav_buffer = generate_wav_file(frames)
        
        return send_file(
            wav_buffer,
            mimetype='audio/wav',
            as_attachment=True,
            download_name='wavetable.wav'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/waveform/enhance', methods=['POST'])
def apply_enhancement():
    """Apply harmonic enhancement to waveform frames."""
    try:
        data = request.get_json()
        frames = data.get('frames', [])
        strength = float(data.get('strength', 0.5))
        
        if not frames:
            raise ValueError("No frame data provided")
        
        enhanced_frames = [enhance_harmonics(np.array(frame), strength) for frame in frames]
        
        response = {
            'waveform': enhanced_frames[0],
            'frames': enhanced_frames,
            'frame_size': len(enhanced_frames[0]),
            'num_frames': len(enhanced_frames),
            'spectrum': np.abs(np.fft.rfft(enhanced_frames[0])).tolist()
        }
        
        return jsonify(response)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True, port=8081, host='0.0.0.0')
