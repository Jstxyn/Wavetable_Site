from abc import ABC, abstractmethod
import numpy as np
from typing import Dict, Any, List

class WaveEffect(ABC):
    """Base class for all waveform effects"""
    
    @abstractmethod
    def process(self, waveform: np.ndarray, params: Dict[str, Any] = None) -> np.ndarray:
        """Process a single waveform"""
        pass
    
    @abstractmethod
    def process_frames(self, frames: List[np.ndarray], params: Dict[str, Any] = None) -> List[np.ndarray]:
        """Process multiple frames"""
        pass
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the effect"""
        pass
    
    @property
    @abstractmethod
    def parameters(self) -> Dict[str, Dict[str, Any]]:
        """
        Return parameter specifications
        Example:
        {
            "gain": {
                "type": "float",
                "min": 0.0,
                "max": 2.0,
                "default": 1.0,
                "description": "Amplitude gain"
            }
        }
        """
        pass
