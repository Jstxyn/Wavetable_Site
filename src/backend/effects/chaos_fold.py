from . import WaveEffect
import numpy as np
from typing import Dict, Any, List
from scipy.integrate import odeint

class ChaosFoldEffect(WaveEffect):
    def __init__(self):
        self._name = "chaos_fold"
        
    @property
    def name(self) -> str:
        return self._name
        
    @property
    def parameters(self) -> Dict[str, Dict[str, Any]]:
        return {
            "sigma": {
                "type": "float",
                "min": 0.0,
                "max": 20.0,
                "default": 10.0,
                "description": "Sigma parameter for Lorenz attractor"
            },
            "rho": {
                "type": "float",
                "min": 0.0,
                "max": 50.0,
                "default": 28.0,
                "description": "Rho parameter for Lorenz attractor"
            },
            "beta": {
                "type": "float",
                "min": 0.0,
                "max": 10.0,
                "default": 8/3,
                "description": "Beta parameter for Lorenz attractor"
            },
            "dt": {
                "type": "float",
                "min": 0.001,
                "max": 0.1,
                "default": 0.01,
                "description": "Time step for integration"
            },
            "mix": {
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 1.0,
                "description": "Mix between original and folded signal"
            }
        }
    
    def _lorenz(self, state, t, sigma, rho, beta):
        """Compute the Lorenz system derivatives."""
        x, y, z = state
        dx = sigma * (y - x)
        dy = x * (rho - z) - y
        dz = x * y - beta * z
        return [dx, dy, dz]
    
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
        
    def process(self, waveform: np.ndarray, params: Dict[str, Any] = None) -> np.ndarray:
        try:
            # Validate parameters
            params = self._validate_params(params)
            
            # Get parameters
            sigma = params['sigma']
            rho = params['rho']
            beta = params['beta']
            dt = params['dt']
            mix = params['mix']
            
            # Ensure waveform is numpy array
            waveform = np.asarray(waveform)
            if len(waveform) == 0:
                return np.array([])
            
            # Normalize input to prevent instability
            waveform_max = np.max(np.abs(waveform))
            if waveform_max > 0:
                waveform_norm = waveform / waveform_max
            else:
                return waveform
            
            # Use multiple samples for initial conditions
            window_size = min(10, len(waveform))
            initial_x = np.mean(waveform_norm[:window_size])
            initial_y = np.std(waveform_norm[:window_size])
            initial_z = 0.0
            
            # Create time points with higher resolution for better accuracy
            num_points = len(waveform) * 4
            t = np.linspace(0, len(waveform) * dt, num_points)
            
            # Solve the Lorenz system
            solution = odeint(
                self._lorenz, 
                [initial_x, initial_y, initial_z], 
                t, 
                args=(sigma, rho, beta),
                rtol=1e-6,
                atol=1e-6
            )
            
            # Extract x component and resample to original length
            indices = np.linspace(0, len(solution) - 1, len(waveform)).astype(int)
            folded = solution[indices, 0]
            
            # Center and normalize the folded signal
            folded = folded - np.mean(folded)
            folded_max = np.max(np.abs(folded))
            if folded_max > 0:
                folded = folded / folded_max
            
            # Apply soft clipping for better dynamics
            folded = np.tanh(folded * 1.5)
            
            # Mix with original signal
            result = (1 - mix) * waveform_norm + mix * folded
            
            # Restore original amplitude
            result = result * waveform_max
            
            return result
            
        except Exception as e:
            print(f"Error in chaos_fold: {str(e)}")
            return waveform
        
    def process_frames(self, frames: List[np.ndarray], params: Dict[str, Any] = None) -> List[np.ndarray]:
        return [self.process(frame, params) for frame in frames]
