"""
File: chaos_fold.py
Purpose: Implements an optimized Chaos Wavefolding effect using the Lorenz attractor
Date: 2025-02-10
"""

from . import WaveEffect
import numpy as np
from typing import Dict, Any, List
from scipy.integrate import odeint
import warnings

# Suppress scipy integration warnings for performance
warnings.filterwarnings('ignore', category=UserWarning, module='scipy.integrate._ivp.rk')

def _lorenz_system(state, t, sigma, rho, beta):
    """Compute the Lorenz system derivatives with vectorized operations."""
    x, y, z = state
    dx = sigma * (y - x)
    dy = x * (rho - z) - y
    dz = x * y - beta * z
    return np.array([dx, dy, dz])

class ChaosFoldEffect(WaveEffect):
    def __init__(self):
        self._name = "chaos_fold"
        self._cache = {}
        
    @property
    def name(self) -> str:
        return self._name
        
    @property
    def parameters(self) -> Dict[str, Dict[str, Any]]:
        return {
            "beta": {
                "type": "float",
                "min": 0.0,
                "max": 2.0,
                "default": 0.5,
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
    
    def _get_cache_key(self, waveform: np.ndarray, params: Dict[str, float]) -> str:
        """Generate a cache key from waveform and parameters."""
        param_str = ':'.join(f"{k}={v}" for k, v in sorted(params.items()))
        waveform_hash = hash(waveform.tobytes())
        return f"{waveform_hash}:{param_str}"
    
    def _validate_params(self, params: Dict[str, Any]) -> Dict[str, float]:
        """Validate and convert parameters to float."""
        if params is None:
            params = {}
            
        valid_params = {}
        param_specs = self.parameters
        
        for name, spec in param_specs.items():
            value = params.get(name, spec['default'])
            try:
                value = float(value)
            except (TypeError, ValueError):
                value = float(spec['default'])
            value = max(spec['min'], min(spec['max'], value))
            valid_params[name] = value
            
        return valid_params

    def _apply_fold_symmetry(self, waveform: np.ndarray, symmetry: float) -> np.ndarray:
        """Apply fold symmetry with vectorized operations."""
        pos_fold = np.maximum(0, waveform)
        neg_fold = np.minimum(0, waveform)
        return pos_fold * symmetry + neg_fold * (2 - symmetry)

    def _apply_complexity(self, waveform: np.ndarray, complexity: float) -> np.ndarray:
        """Add harmonic complexity with vectorized operations."""
        harmonics = np.sin(waveform * np.pi * 2) * complexity
        return waveform + harmonics * (1 - np.abs(waveform))

    def process(self, waveform: np.ndarray, params: Dict[str, Any] = None) -> np.ndarray:
        try:
            # Validate parameters
            params = self._validate_params(params)
            
            # Check cache
            cache_key = self._get_cache_key(waveform, params)
            if cache_key in self._cache:
                return self._cache[cache_key]
            
            # Get parameters
            beta = params['beta']
            dt = params['timeStep']
            mix = params['mix']
            sigma = params['sigma']
            rho = params['rho']
            fold_symmetry = params['foldSymmetry']
            complexity = params['complexity']
            lfo_amount = params['lfoAmount']
            
            # Ensure waveform is numpy array
            waveform = np.asarray(waveform)
            if len(waveform) == 0:
                return np.array([])
            
            # Normalize input to prevent instability
            waveform_max = np.max(np.abs(waveform))
            if waveform_max == 0:
                return waveform
                
            waveform_norm = waveform / waveform_max
            
            # Use multiple samples for initial conditions
            window_size = min(10, len(waveform))
            initial_x = np.mean(waveform_norm[:window_size])
            initial_y = np.std(waveform_norm[:window_size])
            initial_z = 0.0
            
            # Create time points with adaptive resolution
            oversample = 1 + int(complexity * 3)  # Higher oversampling for more complex waveforms
            num_points = len(waveform) * oversample
            t = np.linspace(0, len(waveform) * dt, num_points)
            
            # Solve the Lorenz system with optimized integration
            solution = odeint(
                _lorenz_system,
                [initial_x, initial_y, initial_z],
                t,
                args=(sigma, rho, beta),
                rtol=1e-6,
                atol=1e-6,
                mxstep=1000
            )
            
            # Extract x component and resample to original length
            indices = np.linspace(0, len(solution) - 1, len(waveform)).astype(int)
            folded = solution[indices, 0]
            
            # Center and normalize the folded signal
            folded = folded - np.mean(folded)
            folded_max = np.max(np.abs(folded))
            if folded_max > 0:
                folded = folded / folded_max
            
            # Apply fold symmetry
            folded = self._apply_fold_symmetry(folded, fold_symmetry)
            
            # Add harmonic complexity
            folded = self._apply_complexity(folded, complexity)
            
            # Apply LFO modulation
            if lfo_amount > 0:
                lfo = np.sin(np.linspace(0, 2 * np.pi, len(waveform)))
                folded = folded * (1 + lfo * lfo_amount * 0.5)
            
            # Soft clipping for better dynamics
            folded = np.tanh(folded * (1 + complexity))
            
            # Mix with original signal
            result = (1 - mix) * waveform_norm + mix * folded
            
            # Restore original amplitude
            result = result * waveform_max
            
            # Cache the result
            self._cache[cache_key] = result
            
            # Limit cache size
            if len(self._cache) > 1000:
                self._cache.pop(next(iter(self._cache)))
            
            return result
            
        except Exception as e:
            print(f"Error in chaos_fold: {str(e)}")
            return waveform
        
    def process_frames(self, frames: List[np.ndarray], params: Dict[str, Any] = None) -> List[np.ndarray]:
        """Process multiple frames with the same parameters."""
        return [self.process(frame, params) for frame in frames]
