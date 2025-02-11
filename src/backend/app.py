"""
File: app.py
Purpose: Main Flask application entry point
Date: 2025-02-10
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import logging
import os
import numpy as np
from scipy import signal
import io
import struct
from functools import wraps
import base64
from scipy import ndimage
import cv2
from effects.registry import registry
from api.effects import effects_bp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Register blueprints
app.register_blueprint(effects_bp)

# Configure CORS
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:5174"],
        "methods": ["GET", "POST", "OPTIONS", "HEAD"],
        "allow_headers": ["Content-Type", "Authorization", "Access-Control-Allow-Credentials"],
        "expose_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "send_wildcard": False,
        "max_age": 86400
    }
})

# Add CORS headers to all responses
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5174')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,HEAD')
    if 'Origin' in request.headers:
        response.headers['Access-Control-Allow-Origin'] = request.headers['Origin']
    return response

def handle_errors(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Error in {f.__name__}: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({
                'error': str(e),
                'details': traceback.format_exc()
            }), 500
    return wrapper

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

def generate_wav_file(frames, sample_rate=44100, gain=1.0):
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
        # Apply gain and convert float32 [-1, 1] to int16
        # Clip to prevent overflow
        samples = np.clip(np.array(frame) * gain, -1, 1) * 32767
        samples = samples.astype(np.int16)
        buffer.write(samples.tobytes())
    
    # Set file size in header
    file_size = buffer.tell()
    buffer.seek(4)
    buffer.write(struct.pack('<I', file_size - 8))
    
    buffer.seek(0)
    return buffer

def enhance_harmonics(waveform, strength):
    """Enhance harmonics with formant-like filtering."""
    # Convert input to numpy array if it's a list
    waveform = np.array(waveform)
    
    # Store original phase information
    spectrum = np.fft.rfft(waveform)
    original_phases = np.angle(spectrum)
    original_magnitudes = np.abs(spectrum)
    freqs = np.arange(len(spectrum))
    
    # Create formant-like filter with gentler effect
    center_freq = len(spectrum) // 4
    bandwidth = len(spectrum) // 6  # Slightly narrower bandwidth
    
    # Create resonant peaks with more controlled amplitudes
    formant = np.exp(-0.5 * ((freqs - center_freq) / bandwidth) ** 2)
    formant2 = 0.3 * np.exp(-0.5 * ((freqs - center_freq * 2) / (bandwidth * 1.5)) ** 2)
    formant3 = 0.15 * np.exp(-0.5 * ((freqs - center_freq * 3) / (bandwidth * 2)) ** 2)
    
    # Create a more subtle filter response
    filter_response = np.ones_like(freqs, dtype=float)
    if strength > 0:
        # More controlled additive enhancement
        filter_response = 1.0 + (strength * 0.25 * (formant + formant2 + formant3))
    else:
        # More controlled subtractive enhancement
        filter_response = 1.0 + (strength * 0.15 * (formant + formant2 + formant3))
    
    # Ensure filter response stays very close to 1.0 for low frequencies
    low_freq_mask = freqs < (len(spectrum) // 16)
    filter_response[low_freq_mask] = 1.0 + (filter_response[low_freq_mask] - 1.0) * 0.1
    
    # Clip the filter response to prevent extreme changes
    filter_response = np.clip(filter_response, 0.25, 4.0)
    
    # Apply filter to magnitudes while preserving phases
    enhanced_magnitudes = original_magnitudes * filter_response
    
    # Ensure we preserve the fundamental frequency
    enhanced_magnitudes[1:4] = original_magnitudes[1:4]
    
    # Reconstruct spectrum using original phases
    enhanced_spectrum = enhanced_magnitudes * np.exp(1j * original_phases)
    
    # Preserve DC component exactly
    enhanced_spectrum[0] = spectrum[0]
    
    # Convert back to time domain
    enhanced_waveform = np.fft.irfft(enhanced_spectrum)
    
    # Scale the waveform while preserving shape
    max_abs = np.max(np.abs(enhanced_waveform))
    if max_abs > 0:
        # First normalize
        enhanced_waveform = enhanced_waveform / max_abs
        
        # Then scale to match original amplitude
        original_max = np.max(np.abs(waveform))
        if original_max > 0:
            enhanced_waveform *= original_max
            
        # Blend with original to maintain character
        blend_factor = abs(strength) * 0.5  # More conservative blending
        enhanced_waveform = (1 - blend_factor) * waveform + blend_factor * enhanced_waveform
    
    return enhanced_waveform.tolist()

def lorenz_wavefold(waveform, sigma=10, rho=28, beta=2.667, dt=0.01):
    """
    Apply Lorenz attractor-based chaotic wavefolding to a waveform.
    
    Args:
        waveform: Input waveform (numpy array)
        sigma, rho, beta: Parameters for Lorenz system
        dt: Time step for the Lorenz system
    Returns:
        Folded waveform with chaotic modulation
    """
    try:
        logger.debug(f"Lorenz input shape: {np.array(waveform).shape}, type: {type(waveform)}")
        logger.debug(f"Parameters: sigma={sigma}, rho={rho}, beta={beta}, dt={dt}")
        
        # Convert input to numpy array if it's a list
        waveform = np.array(waveform, dtype=np.float64)
        if waveform.size == 0:
            raise ValueError("Empty waveform array")
            
        # Initialize Lorenz system
        x, y, z = 0.1, 0.1, 0.1
        folded_wave = np.zeros_like(waveform, dtype=np.float64)
        
        # Apply folding with Lorenz modulation
        for i, s in enumerate(waveform):
            # Update Lorenz system
            dx = sigma * (y - x) * dt
            dy = (x * (rho - z) - y) * dt
            dz = (x * y - beta * z) * dt
            x, y, z = x + dx, y + dy, z + dz
            
            # Use chaotic y-value to modulate fold threshold
            fold_threshold = np.tanh(y)
            folded_wave[i] = np.clip(s, -fold_threshold, fold_threshold)
        
        # Normalize the output
        max_val = np.max(np.abs(folded_wave))
        if max_val > 0:
            folded_wave = folded_wave / max_val
            
        logger.debug(f"Lorenz output shape: {folded_wave.shape}")
        return folded_wave
        
    except Exception as e:
        logger.error(f"Error in lorenz_wavefold: {str(e)}")
        logger.error(f"Waveform stats - min: {np.min(waveform) if waveform.size > 0 else 'N/A'}, "
                    f"max: {np.max(waveform) if waveform.size > 0 else 'N/A'}, "
                    f"mean: {np.mean(waveform) if waveform.size > 0 else 'N/A'}")
        raise

def optimize_array(arr, precision=4):
    """Optimize array by reducing precision."""
    return np.round(arr, precision)

def validate_frames(frames):
    """Validate frames data."""
    if not isinstance(frames, list):
        raise ValueError("Frames must be a list")
    if not frames:
        raise ValueError("No frames provided")
    if not all(isinstance(frame, list) for frame in frames):
        raise ValueError("Each frame must be a list")
    if not all(all(isinstance(x, (int, float)) or (isinstance(x, str) and x.replace('.', '').isdigit()) for x in frame) for frame in frames):
        raise ValueError("Frame values must be numbers")
    return True

def validate_params(params):
    """Validate chaos parameters."""
    required = {'sigma', 'rho', 'beta', 'dt'}
    missing = required - set(params.keys())
    if missing:
        raise ValueError(f"Missing required parameters: {missing}")
    
    try:
        validated = {
            'sigma': float(params['sigma']),
            'rho': float(params['rho']),
            'beta': float(params['beta']),
            'dt': float(params['dt'])
        }
        
        # Validate ranges
        if validated['sigma'] <= 0:
            raise ValueError("sigma must be positive")
        if validated['rho'] <= 0:
            raise ValueError("rho must be positive")
        if validated['beta'] <= 0:
            raise ValueError("beta must be positive")
        if validated['dt'] <= 0 or validated['dt'] >= 1:
            raise ValueError("dt must be between 0 and 1")
            
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid parameter value: {str(e)}")
        
    return validated

@app.route('/api/waveform/equation', methods=['POST'])
@handle_errors
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
        logger.error(f"Unexpected error in generate_from_equation: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/waveform/basic', methods=['GET'])
@handle_errors
def get_basic_waveform():
    """Generate basic waveform."""
    try:
        waveform_type = request.args.get('type', 'sine')
        num_frames = int(request.args.get('frames', 8))
        frame_size = 2048
        
        # Generate the basic waveform
        waveform = generate_basic_waveform(waveform_type, frame_size)
        
        # For basic waveforms, use the same waveform for all frames
        frames = [waveform.tolist() for _ in range(num_frames)]
        
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
        logger.error(f"Unexpected error in get_basic_waveform: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/waveform/download', methods=['POST'])
@handle_errors
def download_waveform():
    """Generate and download wavetable as WAV file."""
    try:
        data = request.get_json()
        frames = data.get('frames', [])
        gain = float(data.get('gain', 1.0))
        
        if not frames:
            raise ValueError("No frame data provided")
        
        wav_buffer = generate_wav_file(frames, gain=gain)
        
        return send_file(
            wav_buffer,
            mimetype='audio/wav',
            as_attachment=True,
            download_name='wavetable.wav'
        )
    except Exception as e:
        logger.error(f"Unexpected error in download_waveform: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/waveform/enhance', methods=['POST'])
@handle_errors
def enhance_waveform():
    """Enhance the harmonic content of a waveform."""
    try:
        data = request.get_json()
        frames = data.get('frames', [])
        strength = float(data.get('strength', 0.0))
        waveform_type = data.get('type')
        
        if not frames:
            raise ValueError("No frame data provided")
            
        # Process each frame
        enhanced_frames = [enhance_harmonics(frame, strength) for frame in frames]
        
        # For basic waveforms, ensure we maintain their characteristics
        if waveform_type in ['sine', 'square', 'sawtooth', 'triangle']:
            # Calculate the average frame
            avg_frame = np.mean(enhanced_frames, axis=0)
            # Use this as the base for all frames to prevent morphing
            enhanced_frames = [avg_frame.tolist() for _ in range(len(frames))]
        
        return jsonify({
            'frames': enhanced_frames,
            'waveform': enhanced_frames[0],  # Return first frame for display
            'spectrum': np.abs(np.fft.rfft(enhanced_frames[0])).tolist()
        })
        
    except Exception as e:
        logger.error(f"Unexpected error in enhance_waveform: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/effects', methods=['GET'])
def get_available_effects():
    """Get all available effects and their parameters"""
    try:
        return jsonify(registry.get_all_effects())
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/effects/apply', methods=['POST'])
def apply_effect():
    """Apply an effect to a waveform"""
    try:
        data = request.json
        if not data or 'effect' not in data or 'waveform' not in data:
            return jsonify({'error': 'Missing required parameters'}), 400
            
        effect_name = data['effect']
        waveform = np.array(data['waveform'])
        params = data.get('parameters', {})
        frames = data.get('frames', [])
        
        effect = registry.get_effect(effect_name)
        
        if frames:
            frames = [np.array(frame) for frame in frames]
            processed_frames = effect.process_frames(frames, params)
            processed_frames = [frame.tolist() for frame in processed_frames]
            return jsonify({
                'frames': processed_frames,
                'waveform': processed_frames[0] if processed_frames else []
            })
        else:
            processed = effect.process(waveform, params)
            return jsonify({
                'waveform': processed.tolist(),
                'frames': [processed.tolist()]
            })
            
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/waveform/chaos_fold', methods=['POST', 'OPTIONS'])
@handle_errors
def apply_chaos_fold():
    """Apply chaotic wavefolding to frames."""
    if request.method == 'OPTIONS':
        return make_response('', 204)
        
    try:
        logger.debug("Received chaos fold request")
        
        if not request.is_json:
            logger.error("Request is not JSON")
            return jsonify({'error': 'Request must be JSON'}), 400
            
        try:
            data = request.get_json(force=True)
            logger.debug(f"Raw request data: {data}")
        except Exception as e:
            logger.error(f"Failed to parse JSON: {str(e)}")
            return jsonify({'error': 'Invalid JSON format'}), 400
            
        if not data:
            logger.error("Empty request data")
            return jsonify({'error': 'No data provided'}), 400
            
        # Extract and validate frames
        frames = data.get('frames')
        if not frames:
            logger.error("No frame data provided")
            return jsonify({'error': 'No frame data provided'}), 400
            
        try:
            validate_frames(frames)
            frames = [[float(x) for x in frame] for frame in frames]
        except ValueError as e:
            logger.error(f"Frame validation error: {str(e)}")
            return jsonify({'error': str(e)}), 400
            
        # Extract and validate parameters
        try:
            params = validate_params(data)
        except ValueError as e:
            logger.error(f"Parameter validation error: {str(e)}")
            return jsonify({'error': str(e)}), 400
            
        logger.debug(f"Processing with parameters: {params}")
        
        # Process each frame with the chaos folder
        processed_frames = []
        try:
            for frame in frames:
                frame_array = np.array(frame, dtype=np.float64)
                if frame_array.size == 0:
                    logger.error("Empty frame data")
                    return jsonify({'error': 'Empty frame data'}), 400
                    
                folded = lorenz_wavefold(
                    frame_array,
                    sigma=params['sigma'],
                    rho=params['rho'],
                    beta=params['beta'],
                    dt=params['dt']
                )
                processed_frames.append(optimize_array(folded, precision=4).tolist())
            
            # Calculate spectrum for visualization
            spectrum = optimize_array(np.abs(np.fft.fft(processed_frames[0])), precision=4).tolist()
            
            # Prepare response
            response = {
                'waveform': processed_frames[0],
                'frames': processed_frames,
                'frame_size': len(processed_frames[0]),
                'num_frames': len(processed_frames),
                'spectrum': spectrum
            }
            
            # Validate response data
            if not all(isinstance(arr, list) for arr in [response['waveform'], response['frames'][0], response['spectrum']]):
                raise ValueError("Invalid response data format")
            
            logger.debug("Successfully processed chaos fold request")
            return jsonify(response)
            
        except Exception as e:
            logger.error(f"Error processing frames: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({'error': f'Error processing frames: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Unexpected error in apply_chaos_fold: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/waveform/image', methods=['POST'])
def image_to_wavetable():
    try:
        data = request.json
        if not data or 'image' not in data:
            return jsonify({'error': 'No image data provided'}), 400
            
        image_data = data.get('image')
        if not image_data.startswith('data:image/'):
            return jsonify({'error': 'Invalid image data format'}), 400
            
        # Extract the base64 data after the comma
        image_data = image_data.split(',', 1)[1]
        
        try:
            # Decode image data
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            
            # Use OpenCV to decode image
            img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            
            if img is None:
                return jsonify({'error': 'Failed to decode image'}), 400
                
            # Log the original image shape
            logger.info(f"Original image shape: {img.shape}")
                
            # Resize to 2048x256 (standard wavetable dimensions)
            img = cv2.resize(img, (2048, 256), interpolation=cv2.INTER_LINEAR)
            
            # Log the resized image shape
            logger.info(f"Resized image shape: {img.shape}")
            
            # Convert to float and normalize to [-1, 1]
            img = img.astype(np.float32) / 127.5 - 1.0
            
            # Create frames (each column becomes a frame)
            frames = []
            for i in range(img.shape[1]):
                frames.append(img[:, i].tolist())
            
            # Create the waveform data (first frame)
            waveform = frames[0]
            
            # Optimize arrays for transmission
            frames = optimize_array(frames)
            waveform = optimize_array(waveform)
            
            return jsonify({
                'waveform': waveform,
                'frames': frames,
                'frame_size': len(frames[0]),
                'num_frames': len(frames),
                'type': 'image',
                'spectrum': []  # Empty spectrum for now
            })
            
        except Exception as e:
            logger.error(f"Error processing image: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({'error': 'Failed to process image data'}), 400
            
    except Exception as e:
        logger.error(f"Error in image_to_wavetable: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8081))
    app.run(host='0.0.0.0', port=port, debug=True)
