from . import WaveEffect
import numpy as np
from typing import Dict, Any, List

class GainEffect(WaveEffect):
    def __init__(self):
        self._name = "gain"
        
    @property
    def name(self) -> str:
        return self._name
        
    @property
    def parameters(self) -> Dict[str, Dict[str, Any]]:
        return {
            "gain": {
                "type": "float",
                "min": 0.0,
                "max": 2.0,
                "default": 1.0,
                "description": "Amplitude gain"
            }
        }
        
    def process(self, waveform: np.ndarray, params: Dict[str, Any] = None) -> np.ndarray:
        if params is None:
            params = {"gain": 1.0}
        gain = params.get("gain", 1.0)
        return waveform * gain
        
    def process_frames(self, frames: List[np.ndarray], params: Dict[str, Any] = None) -> List[np.ndarray]:
        return [self.process(frame, params) for frame in frames]
