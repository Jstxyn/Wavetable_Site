"""
File: chaos_fold.py
Purpose: Implements an optimized Chaos Wavefolding effect using the Lorenz attractor
Date: 2025-02-11
"""

from . import WaveEffect
import numpy as np
from typing import Dict, Any, List
from scipy.integrate import odeint
import logging
import threading

logger = logging.getLogger(__name__)

# Thread-local storage for caching
_local = threading.local()

def _get_cache():
    if not hasattr(_local, 'cache'):
        _local.cache = {}
    return _local.cache

def _lorenz_system(state, t, sigma, rho, beta):
    """Compute the Lorenz system derivatives."""
    x, y, z = state
    dx = sigma * (y - x)
    dy = x * (rho - z) - y
    dz = x * y - beta * z
    return np.array([dx, dy, dz])

class ChaosFoldEffect(WaveEffect):
    def __init__(self):
        self._name = "chaosFold"  # Must match the key in effect_processors
        
    @property
    def name(self) -> str:
        return self._name
        
    @property
    def parameters(self) -> Dict[str, Dict[str, Any]]:
        return {
            "beta": {
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 0.48,
                "description": "Controls folding strength"
            },
            "timeStep": {
                "type": "float",
                "min": 0.001,
                "max": 0.1,
                "default": 0.01,
                "description": "Time evolution of attractor"
            },
            "mix": {
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 1.0,
                "description": "Blend between original and folded"
            },
            "sigma": {
                "type": "float",
                "min": 0.0,
                "max": 20.0,
                "default": 10.0,
                "description": "Input sensitivity"
            },
            "rho": {
                "type": "float",
                "min": 0.0,
                "max": 50.0,
                "default": 28.0,
                "description": "Feedback intensity"
            },
            "foldSymmetry": {
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 0.5,
                "description": "Folding symmetry"
            },
            "complexity": {
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 0.5,
                "description": "Higher-order harmonics"
            },
            "lfoAmount": {
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 0.0,
                "description": "LFO modulation amount"
            }
        }
    
    def _validate_params(self, params: Dict[str, Any]) -> Dict[str, float]:
        """Validate and convert parameters to float."""
        if params is None:
            params = {}
            
        valid_params = {}
        param_specs = self.parameters
        
        for name, spec in param_specs.items():
            try:
                value = float(params.get(name, spec['default']))
                value = max(spec['min'], min(spec['max'], value))
                valid_params[name] = value
            except (TypeError, ValueError) as e:
                logger.warning(f"Invalid parameter {name}: {e}, using default")
                valid_params[name] = float(spec['default'])
                
        return valid_params

    def _get_cache_key(self, waveform: np.ndarray, params: Dict[str, float]) -> str:
        """Generate a cache key from waveform and parameters."""
        param_str = ':'.join(f"{k}={v:.6f}" for k, v in sorted(params.items()))
        waveform_hash = hash(waveform.tobytes())
        return f"{waveform_hash}:{param_str}"

    def process(self, waveform: np.ndarray, params: Dict[str, Any] = None) -> np.ndarray:
        """
        Apply chaos-based wavefolding to the input waveform.
        
        Args:
            waveform (np.ndarray): Input waveform array
            params (dict): Effect parameters
        
        Returns:
            np.ndarray: Processed waveform array
        """
        try:
            # Input validation
            if waveform is None or len(waveform) == 0:
                logger.error("Empty waveform received")
                return np.array([], dtype=np.float32)

            # Validate parameters
            params = self._validate_params(params)
            
            # Check cache
            cache_key = self._get_cache_key(waveform, params)
            cache = _get_cache()
            if cache_key in cache:
                return cache[cache_key].copy()

            # Convert to float32 and normalize for processing
            waveform = np.asarray(waveform, dtype=np.float32)
            max_abs = np.max(np.abs(waveform))
            if max_abs < 1e-6:
                return np.zeros_like(waveform, dtype=np.float32)
                
            waveform_norm = waveform / max_abs

            # Process in chunks for better performance
            chunk_size = min(1024, len(waveform))
            num_chunks = (len(waveform) + chunk_size - 1) // chunk_size
            
            x = np.zeros_like(waveform_norm)
            y = np.zeros_like(waveform_norm)
            z = np.zeros_like(waveform_norm)
            
            # Initialize first chunk
            x[0] = waveform_norm[0]
            y[0] = 0.0
            z[0] = 20.0
            
            # Process each chunk
            for chunk in range(num_chunks):
                start = chunk * chunk_size
                end = min((chunk + 1) * chunk_size, len(waveform))
                
                # Generate Lorenz attractor trajectory for this chunk
                for i in range(max(1, start), end):
                    dx = params['sigma'] * (y[i-1] - x[i-1])
                    dy = x[i-1] * (params['rho'] - z[i-1]) - y[i-1]
                    dz = x[i-1] * y[i-1] - params['beta'] * z[i-1]
                    
                    x[i] = x[i-1] + dx * params['timeStep']
                    y[i] = y[i-1] + dy * params['timeStep']
                    z[i] = z[i-1] + dz * params['timeStep']
            
            # Normalize trajectories using vectorized operations
            for arr in [x, y, z]:
                max_val = np.max(np.abs(arr))
                if max_val > 0:
                    arr /= max_val
            
            # Apply folding and modulation using vectorized operations
            combined = waveform_norm + (x * 0.3 + y * 0.3 + z * 0.4) * params['complexity']
            threshold = 1.0 + params['complexity'] * 2.0
            
            # Vectorized folding
            folded = combined.copy()
            while np.any(np.abs(folded) > threshold):
                mask_high = folded > threshold
                mask_low = folded < -threshold
                folded[mask_high] = 2 * threshold - folded[mask_high]
                folded[mask_low] = -2 * threshold - folded[mask_low]
            
            # Apply fold symmetry
            if params['foldSymmetry'] != 0.5:
                pos_mask = folded > 0
                neg_mask = ~pos_mask
                folded[pos_mask] *= (1.0 + (params['foldSymmetry'] - 0.5))
                folded[neg_mask] *= (1.0 + (0.5 - params['foldSymmetry']))
            
            # Apply LFO modulation
            if params['lfoAmount'] > 0:
                phase = 2 * np.pi * np.arange(len(waveform)) / len(waveform)
                lfo = np.sin(phase) * params['lfoAmount']
                folded *= (1.0 + lfo)
            
            # Normalize folded output
            max_folded = np.max(np.abs(folded))
            if max_folded > 0:
                folded /= max_folded
            
            # Mix dry and wet signals
            result = (1 - params['mix']) * waveform_norm + params['mix'] * folded
            
            # Restore original amplitude and validate
            result = result * max_abs
            
            if np.any(np.isnan(result)) or np.any(np.isinf(result)):
                logger.error("Invalid values in output, returning input")
                return waveform
            
            # Cache result with size limit
            result = result.astype(np.float32)
            cache[cache_key] = result.copy()
            
            if len(cache) > 100:  # Reduced cache size
                oldest_key = next(iter(cache))
                cache.pop(oldest_key)
            
            return result
            
        except Exception as e:
            logger.error(f"Error in chaos_fold processing: {str(e)}")
            return waveform

    def process_frames(self, frames: List[np.ndarray], params: Dict[str, Any] = None) -> List[np.ndarray]:
        """Process multiple frames with the same parameters."""
        return [self.process(frame, params) for frame in frames]
