"""
File: effects.py
Purpose: API endpoints for effect processing with comprehensive error handling
Date: 2025-02-10
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

effects_bp = Blueprint('effects', __name__)

# Initialize effects
effect_processors = {
    'chaosFold': ChaosFoldEffect()
}

def validate_effect_request(f):
    """Decorator to validate effect API requests."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            data = request.get_json()
            if not data:
                logger.error("No data provided in request")
                return jsonify({'error': 'No data provided'}), 400

            required_fields = ['effectId', 'waveform', 'parameters']
            missing_fields = [field for field in required_fields if field not in data]
            if missing_fields:
                logger.error(f"Missing required fields: {missing_fields}")
                return jsonify({'error': f'Missing required fields: {missing_fields}'}), 400

            # Validate waveform data
            waveform = data['waveform']
            if not isinstance(waveform, list):
                logger.error("Waveform must be a list")
                return jsonify({'error': 'Waveform must be a list'}), 400

            # Validate effect ID
            effect_id = data['effectId']
            if effect_id not in effect_processors:
                logger.error(f"Effect {effect_id} not found")
                return jsonify({'error': f'Effect {effect_id} not found'}), 404

            # Validate parameters
            parameters = data['parameters']
            if not isinstance(parameters, dict):
                logger.error("Parameters must be a dictionary")
                return jsonify({'error': 'Parameters must be a dictionary'}), 400

            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Request validation failed: {str(e)}\n{traceback.format_exc()}")
            return jsonify({'error': 'Invalid request format'}), 400
    return wrapper

@effects_bp.route('/api/effects/apply', methods=['POST'])
@validate_effect_request
def apply_effect():
    """
    Apply an effect to a waveform.
    
    Expected request format:
    {
        "effectId": "chaosFold",
        "waveform": [...],
        "parameters": {
            "beta": 0.48,
            "timeStep": 0.01,
            "mix": 1.0,
            "sigma": 10.0,
            "rho": 28.0,
            "foldSymmetry": 0.5,
            "complexity": 0.5,
            "lfoAmount": 0.0
        }
    }
    """
    try:
        data = request.get_json()
        effect_id = data['effectId']
        waveform = np.array(data['waveform'])
        parameters = data['parameters']

        # Get the effect processor
        processor = effect_processors[effect_id]
        
        # Log processing attempt
        logger.info(f"Processing effect {effect_id} with parameters: {parameters}")

        # Process the waveform
        try:
            processed = processor.process(waveform, parameters)
            
            # Convert to list and validate output
            result = processed.tolist()
            if not result or not all(isinstance(x, (int, float)) for x in result):
                raise ValueError("Invalid output from effect processor")

            logger.info(f"Successfully processed effect {effect_id}")
            return jsonify({
                'waveform': result,
                'effectId': effect_id
            })
        except Exception as e:
            logger.error(f"Effect processing failed: {str(e)}\n{traceback.format_exc()}")
            return jsonify({
                'error': f'Effect processing failed: {str(e)}',
                'details': traceback.format_exc()
            }), 500

    except Exception as e:
        logger.error(f"Request processing failed: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            'error': f'Request processing failed: {str(e)}',
            'details': traceback.format_exc()
        }), 500

@effects_bp.route('/api/effects/available', methods=['GET'])
def get_available_effects():
    """Get a list of available effects and their parameters."""
    try:
        effects = {}
        for effect_id, processor in effect_processors.items():
            effects[effect_id] = {
                'name': processor.name,
                'parameters': processor.parameters
            }
        return jsonify(effects)
    except Exception as e:
        logger.error(f"Failed to get available effects: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500
