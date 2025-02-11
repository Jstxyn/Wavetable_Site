"""
File: effects.py
Purpose: API endpoints for waveform effects processing
Date: 2025-02-11
"""

from flask import Blueprint, request, jsonify
from backend.effects.chaos_fold import ChaosFoldEffect
from typing import Dict, Any
import logging
import numpy as np
from functools import wraps
import traceback

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

effects_bp = Blueprint('effects', __name__)

# Initialize effects with proper error handling
effect_processors = {}
try:
    effect_processors['chaosFold'] = ChaosFoldEffect()
    logger.info("Successfully initialized ChaosFoldEffect")
except Exception as e:
    logger.error(f"Failed to initialize ChaosFoldEffect: {str(e)}")

def validate_effect_request(f):
    """Decorator to validate effect API requests."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            # Get request data
            data = request.get_json()
            if not data:
                logger.error("No data provided in request")
                return jsonify({'error': 'No data provided'}), 400

            # Validate data structure
            required_fields = ['effectId', 'waveform']
            missing_fields = [field for field in required_fields if field not in data]
            if missing_fields:
                logger.error(f"Missing required fields: {missing_fields}")
                return jsonify({'error': f'Missing required fields: {missing_fields}'}), 400

            # Validate effect ID
            effect_id = data['effectId']
            if effect_id not in effect_processors:
                logger.error(f"Effect {effect_id} not found")
                return jsonify({'error': f'Effect {effect_id} not found'}), 404

            # Validate waveform data
            waveform = data['waveform']
            if not isinstance(waveform, list):
                logger.error("Waveform must be a list")
                return jsonify({'error': 'Waveform must be a list'}), 400
                
            if not waveform:
                logger.error("Empty waveform provided")
                return jsonify({'error': 'Empty waveform provided'}), 400
                
            if not all(isinstance(x, (int, float)) for x in waveform):
                logger.error("Waveform must contain only numbers")
                return jsonify({'error': 'Waveform must contain only numbers'}), 400

            return f(*args, **kwargs)
            
        except Exception as e:
            logger.error(f"Request validation failed: {str(e)}")
            return jsonify({'error': 'Invalid request format'}), 400
    return wrapper

@effects_bp.route('/api/effects/apply', methods=['POST'])
@validate_effect_request
def apply_effect():
    """Apply an effect to a waveform."""
    try:
        # Get validated request data
        data = request.get_json()
        effect_id = data['effectId']
        waveform = np.array(data['waveform'], dtype=np.float32)
        parameters = data.get('parameters', {})

        # Get effect processor
        processor = effect_processors[effect_id]
        
        # Log processing attempt
        logger.info(f"Processing effect {effect_id} with parameters: {parameters}")

        try:
            # Process the waveform
            processed = processor.process(waveform, parameters)
            
            # Validate output
            if processed is None or len(processed) != len(waveform):
                raise ValueError("Effect returned invalid waveform length")
                
            if not isinstance(processed, np.ndarray):
                raise ValueError("Effect returned invalid data type")
                
            if np.any(np.isnan(processed)) or np.any(np.isinf(processed)):
                raise ValueError("Effect produced invalid values")

            # Convert to list and validate
            result = processed.tolist()
            if not all(isinstance(x, (int, float)) for x in result):
                raise ValueError("Invalid output values from effect processor")

            # Return result with metadata
            logger.info(f"Successfully processed effect {effect_id}")
            return jsonify({
                'waveform': result,
                'metadata': {
                    'sampleRate': 44100,
                    'length': len(result),
                    'peakValue': float(np.max(np.abs(processed))),
                    'effectId': effect_id,
                    'status': 'success'
                }
            })
            
        except Exception as e:
            logger.error(f"Effect processing failed: {str(e)}\n{traceback.format_exc()}")
            # Return original waveform on error
            return jsonify({
                'waveform': waveform.tolist(),
                'metadata': {
                    'sampleRate': 44100,
                    'length': len(waveform),
                    'peakValue': float(np.max(np.abs(waveform))),
                    'effectId': effect_id,
                    'status': 'error',
                    'error': str(e)
                }
            })

    except Exception as e:
        logger.error(f"Request processing failed: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@effects_bp.route('/api/effects/available', methods=['GET'])
def get_available_effects():
    """Get a list of available effects and their parameters."""
    try:
        effects = {}
        for effect_id, processor in effect_processors.items():
            try:
                effects[effect_id] = {
                    'name': processor.name,
                    'parameters': processor.parameters,
                    'status': 'available'
                }
            except Exception as e:
                logger.error(f"Failed to get info for effect {effect_id}: {str(e)}")
                effects[effect_id] = {
                    'name': effect_id,
                    'status': 'error',
                    'error': str(e)
                }
                
        return jsonify(effects)
    except Exception as e:
        logger.error(f"Failed to get available effects: {str(e)}")
        return jsonify({'error': str(e)}), 500
