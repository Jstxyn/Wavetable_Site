import numpy as np
from typing import List, Union, Tuple

def normalize_waveform(samples: np.ndarray) -> np.ndarray:
    """Normalize waveform to range [-1, 1]."""
    if len(samples) == 0:
        return samples
    max_abs = np.max(np.abs(samples))
    if max_abs > 0:
        return samples / max_abs
    return samples

def interpolate_frames(frame1: np.ndarray, frame2: np.ndarray, num_steps: int) -> List[np.ndarray]:
    """Linear interpolation between two wavetable frames."""
    frames = []
    for i in range(num_steps):
        t = i / (num_steps - 1)
        frame = (1 - t) * frame1 + t * frame2
        frames.append(frame)
    return frames

def validate_wavetable(frames: List[np.ndarray]) -> Tuple[bool, str]:
    """Validate wavetable frames for consistency and proper format."""
    if not frames:
        return False, "No frames provided"
    
    expected_length = len(frames[0])
    for i, frame in enumerate(frames):
        if len(frame) != expected_length:
            return False, f"Frame {i} has inconsistent length"
        if not np.all(np.isfinite(frame)):
            return False, f"Frame {i} contains invalid values"
    
    return True, "Valid wavetable"
