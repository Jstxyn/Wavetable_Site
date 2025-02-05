from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import numpy as np
from pathlib import Path
import json
import io
from scipy.fft import fft
from scipy.io import wavfile
import logging
import sys
import re

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('wavetable_debug.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

def is_localhost(origin):
    """Check if origin is a localhost domain."""
    if not origin:
        return False
    localhost_patterns = [
        r'^https?://localhost(:\d+)?$',
        r'^https?://127\.0\.0\.1(:\d+)?$',
        r'^https?://\[::1\](:\d+)?$'
    ]
    return any(re.match(pattern, origin) for pattern in localhost_patterns)

# Configure CORS globally for all routes
CORS(app, 
     resources={
         r"/*": {
             "origins": "*",  # We'll check for localhost in our handlers
             "methods": ["GET", "POST", "OPTIONS"],
             "allow_headers": ["Content-Type"],
             "supports_credentials": True
         }
     })

# Configure app settings
app.config.update(
    WAVETABLE_SIZE=2048,  # Serum uses 2048 samples per frame
    DEFAULT_PREVIEW_SIZE=256,  # Size for preview/visualization
    MAX_FRAMES=256,  # Maximum number of frames in a wavetable
    MAX_HARMONICS=256,  # Maximum number of harmonics
    SAMPLE_RATE=44100   # Sample rate for WAV file
)

def handle_preflight():
    """Handle CORS preflight requests."""
    origin = request.headers.get('Origin', '')
    if not is_localhost(origin):
        logger.error(f"Invalid origin: {origin}")
        return jsonify({'error': 'Invalid origin'}), 403
        
    response = jsonify({'status': 'success'})
    response.headers.update({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
        'Vary': 'Origin'  # Important for proxies to respect varying origins
    })
    return response

@app.after_request
def after_request(response):
    """Add CORS headers to all responses."""
    origin = request.headers.get('Origin', '')
    logger.debug(f"Handling request from origin: {origin}")
    
    if is_localhost(origin):
        response.headers.update({
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
            'Vary': 'Origin'
        })
    return response

@app.route('/', methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_all_options(path=None):
    """Handle OPTIONS requests for all routes."""
    return handle_preflight()

def generate_waveform(waveform_type, num_samples, num_harmonics):
    """Generate waveform with specified number of harmonics."""
    x = np.linspace(0, 2*np.pi, num_samples, endpoint=False)
    
    if waveform_type == 'sine':
        y = np.sin(x)
    elif waveform_type == 'square':
        y = np.zeros_like(x)
        for n in range(1, min(num_harmonics + 1, num_samples//2), 2):
            y += (4/(n*np.pi)) * np.sin(n*x)
    elif waveform_type == 'sawtooth':
        y = np.zeros_like(x)
        for n in range(1, min(num_harmonics + 1, num_samples//2)):
            y += (-2/(n*np.pi)) * np.sin(n*x)
    elif waveform_type == 'triangle':
        y = np.zeros_like(x)
        for n in range(1, min(num_harmonics + 1, num_samples//2), 2):
            y += (8/(n*np.pi)**2) * np.sin(n*x) * (-1)**((n-1)//2)
    else:
        raise ValueError(f"Unknown waveform type: {waveform_type}")
    
    # Normalize to [-1, 1]
    y = y / np.max(np.abs(y))
    return y

def morph_waveforms(waveform1, waveform2, morph_factor):
    """Morph between two waveforms using linear interpolation."""
    return (1 - morph_factor) * waveform1 + morph_factor * waveform2

def generate_frame_sequence(frame_data, num_samples):
    """Generate a sequence of frames with morphing."""
    logger.info(f"Starting frame sequence generation with {len(frame_data)} frames")
    logger.info(f"Target samples per frame: {num_samples}")
    
    if not frame_data:
        logger.error("No frame data provided")
        return []

    frames = []
    total_frames = app.config['MAX_FRAMES']  # 256 frames
    logger.info(f"Target total frames: {total_frames}")
    
    try:
        # Generate base waveforms for key frames
        base_frames = []
        for i, frame in enumerate(frame_data):
            logger.info(f"Generating base frame {i}: {frame['type']}")
            waveform = generate_waveform(
                frame['type'],
                num_samples,
                frame['harmonics']
            )
            base_frames.append(waveform)
            logger.info(f"Base frame {i} shape: {waveform.shape}")
        
        # If only one frame, repeat it
        if len(base_frames) == 1:
            logger.info("Single frame case - repeating frame")
            frames = [base_frames[0]] * total_frames
            logger.info(f"Generated {len(frames)} frames")
            return frames
        
        # Calculate frames between each pair of base frames
        segments = len(base_frames) - 1
        frames_per_segment = (total_frames - len(base_frames)) // segments
        remaining_frames = (total_frames - len(base_frames)) % segments
        
        logger.info(f"Segments: {segments}")
        logger.info(f"Frames per segment: {frames_per_segment}")
        logger.info(f"Remaining frames: {remaining_frames}")
        
        # Add first frame
        frames.append(base_frames[0])
        logger.info("Added first frame")
        
        # Generate frames for each segment
        for i in range(segments):
            current = base_frames[i]
            next_frame = base_frames[i + 1]
            logger.info(f"Processing segment {i} between {frame_data[i]['type']} and {frame_data[i+1]['type']}")
            
            # Calculate number of frames for this segment
            segment_frames = frames_per_segment
            if i < remaining_frames:
                segment_frames += 1
            logger.info(f"Generating {segment_frames} frames for segment {i}")
            
            # Generate interpolated frames
            for f in range(segment_frames):
                t = (f + 1) / (segment_frames + 1)  # +1 because we want to exclude start/end frames
                morphed = morph_waveforms(current, next_frame, t)
                frames.append(morphed)
            
            # Add the next base frame
            frames.append(next_frame)
            logger.info(f"Added frame {len(frames)} of {total_frames}")
        
        logger.info(f"Final frame count: {len(frames)}")
        # Verify we have exactly 256 frames
        assert len(frames) == total_frames, f"Generated {len(frames)} frames instead of {total_frames}"
        return frames
        
    except Exception as e:
        logger.error(f"Error in generate_frame_sequence: {str(e)}", exc_info=True)
        raise

def create_wavetable_wav(frames):
    """Create a Serum-compatible wavetable WAV file.
    
    Serum wavetable specifications:
    - 44.1kHz sample rate
    - 2048 samples per frame
    - 256 frames total
    - 32-bit float format
    - Normalized to [-1, 1]
    """
    try:
        # Convert frames to numpy array
        audio_data = np.array(frames, dtype=np.float32)
        logger.info(f"Initial audio data shape: {audio_data.shape}")
        
        # Validate frame dimensions
        if len(audio_data.shape) != 2:
            raise ValueError("Expected 2D array of frames")
            
        num_frames, samples_per_frame = audio_data.shape
        if num_frames != app.config['MAX_FRAMES']:
            raise ValueError(f"Expected {app.config['MAX_FRAMES']} frames, got {num_frames}")
        if samples_per_frame != app.config['WAVETABLE_SIZE']:
            raise ValueError(f"Expected {app.config['WAVETABLE_SIZE']} samples per frame, got {samples_per_frame}")
        
        # Normalize each frame to [-1, 1] using percentile normalization
        # This helps prevent outliers from affecting the normalization
        for i in range(num_frames):
            frame = audio_data[i]
            p1, p99 = np.percentile(frame, [1, 99])
            frame = np.clip(frame, p1, p99)
            max_val = np.max(np.abs(frame))
            if max_val > 0:
                audio_data[i] = frame / max_val
                
        # Additional safety check for NaN/Inf values
        if not np.all(np.isfinite(audio_data)):
            raise ValueError("Invalid values (NaN/Inf) detected in audio data")
            
        logger.info(f"Audio data shape: {audio_data.shape}")
        logger.info(f"Audio data range: [{audio_data.min():.2f}, {audio_data.max():.2f}]")
        
        # Reshape to interleaved format (total_samples,)
        audio_data = audio_data.reshape(-1)
        
        # Create WAV file
        buffer = io.BytesIO()
        wavfile.write(buffer, app.config['SAMPLE_RATE'], audio_data)
        buffer.seek(0)
        
        # Verify file size
        file_size = buffer.getbuffer().nbytes
        expected_size = app.config['MAX_FRAMES'] * app.config['WAVETABLE_SIZE'] * 4  # 4 bytes per float32
        if file_size < expected_size:
            raise ValueError(f"WAV file too small: {file_size} bytes (expected >= {expected_size})")
            
        logger.info(f"WAV file created successfully: {file_size} bytes")
        return buffer
        
    except Exception as e:
        logger.error(f"Error in create_wavetable_wav: {str(e)}", exc_info=True)
        raise

def analyze_spectrum(waveform):
    """Perform FFT analysis on the waveform."""
    spectrum = np.abs(fft(waveform))
    return spectrum[:len(spectrum)//2].tolist()

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "message": "Wavetable Editor API is running"})

@app.route('/api/waveform/basic', methods=['GET', 'OPTIONS'])
def get_basic_waveform():
    """Generate basic waveform types with spectrum analysis."""
    if request.method == 'OPTIONS':
        return handle_preflight()
        
    try:
        waveform_type = request.args.get('type', 'sine')
        if waveform_type not in ['sine', 'square', 'sawtooth', 'triangle']:
            raise ValueError(f"Invalid waveform type: {waveform_type}")
            
        num_samples = app.config['DEFAULT_PREVIEW_SIZE']
        num_harmonics = min(
            int(request.args.get('harmonics', app.config['MAX_HARMONICS'])),
            app.config['MAX_HARMONICS']
        )
        
        logger.info(f"Generating basic waveform: type={waveform_type}, harmonics={num_harmonics}")
        y = generate_waveform(waveform_type, num_samples, num_harmonics)
        spectrum = analyze_spectrum(y)
        
        response = jsonify({
            "waveform": y.tolist(),
            "spectrum": spectrum,
            "type": waveform_type,
            "samples": num_samples,
            "harmonics": num_harmonics
        })
        
        # Add CORS headers
        origin = request.headers.get('Origin', '')
        if is_localhost(origin):
            response.headers.update({
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Credentials': 'true',
                'Vary': 'Origin'
            })
        
        return response
        
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Error generating waveform: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/waveform/export', methods=['POST', 'OPTIONS'])
def export_wavetable():
    """Export wavetable as WAV file."""
    if request.method == 'OPTIONS':
        return handle_preflight()
        
    try:
        # Validate request
        if not request.is_json:
            raise ValueError("Request must be JSON")
            
        data = request.get_json()
        if not data:
            raise ValueError("No data received")
            
        frames = data.get('frames')
        if not frames:
            raise ValueError("No frames provided")
        if not isinstance(frames, list):
            raise ValueError("Frames must be a list")
        if len(frames) == 0:
            raise ValueError("Empty frames list")
            
        logger.info(f"Received export request with {len(frames)} frames")
        
        # Validate each frame
        for i, frame in enumerate(frames):
            if not isinstance(frame, dict):
                raise ValueError(f"Frame {i} must be an object")
            if 'type' not in frame:
                raise ValueError(f"Frame {i} missing 'type'")
            if 'harmonics' not in frame:
                raise ValueError(f"Frame {i} missing 'harmonics'")
            if not isinstance(frame['harmonics'], (int, float)):
                raise ValueError(f"Frame {i} harmonics must be a number")
            if frame['harmonics'] < 1 or frame['harmonics'] > app.config['MAX_HARMONICS']:
                raise ValueError(f"Frame {i} harmonics must be between 1 and {app.config['MAX_HARMONICS']}")
                
            logger.info(f"Frame {i}: type={frame['type']}, harmonics={frame['harmonics']}, morph={frame.get('morph', False)}")
        
        # Generate wavetable frames
        logger.info("Generating wavetable frames...")
        all_frames = generate_frame_sequence(frames, app.config['WAVETABLE_SIZE'])
        
        # Create WAV file
        logger.info("Creating WAV file...")
        wav_buffer = create_wavetable_wav(all_frames)
        
        # Prepare filename
        frame_types = '_'.join(frame['type'] for frame in frames)
        filename = f"wavetable_{frame_types}_{len(frames)}frames.wav"
        logger.info(f"Sending file: {filename}")
        
        # Send response
        response = send_file(
            wav_buffer,
            mimetype='audio/wav',
            as_attachment=True,
            download_name=filename
        )
        
        # Add CORS headers
        origin = request.headers.get('Origin', '')
        if is_localhost(origin):
            response.headers.update({
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Credentials': 'true',
                'Vary': 'Origin'
            })
        
        logger.info("Response prepared successfully")
        return response
        
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in export_wavetable: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/waveform/equation', methods=['POST'])
def generate_from_equation():
    """Generate waveform from mathematical equation."""
    data = request.get_json()
    
    if not data or 'equation' not in data:
        return jsonify({"error": "No equation provided"}), 400
        
    # TODO: Implement safe equation parsing and evaluation
    return jsonify({"error": "Equation parsing not yet implemented"}), 501

if __name__ == '__main__':
    app.run(debug=True, port=8081, host='0.0.0.0')
