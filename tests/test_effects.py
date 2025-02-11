"""
Test suite for waveform effects
"""

import pytest
import numpy as np
from backend.effects.chaos_fold import ChaosFoldEffect

def test_chaos_fold_effect():
    """Test the chaos fold effect processor"""
    # Initialize effect
    effect = ChaosFoldEffect()
    
    # Test with simple sine wave
    x = np.linspace(0, 2*np.pi, 1000)
    waveform = np.sin(x)
    
    # Test with default parameters
    result = effect.process(waveform)
    assert isinstance(result, np.ndarray)
    assert len(result) == len(waveform)
    assert not np.any(np.isnan(result))
    assert not np.any(np.isinf(result))
    
    # Test with custom parameters
    params = {
        'beta': 0.5,
        'timeStep': 0.01,
        'mix': 0.7,
        'sigma': 12.0,
        'rho': 30.0,
        'foldSymmetry': 0.6,
        'complexity': 0.8,
        'lfoAmount': 0.3
    }
    result = effect.process(waveform, params)
    assert isinstance(result, np.ndarray)
    assert len(result) == len(waveform)
    assert not np.any(np.isnan(result))
    assert not np.any(np.isinf(result))
    
    # Test with empty waveform
    result = effect.process(np.array([]))
    assert isinstance(result, np.ndarray)
    assert len(result) == 0
    
    # Test with invalid parameters
    params = {
        'beta': 'invalid',
        'timeStep': -1,
        'mix': 2.0
    }
    result = effect.process(waveform, params)
    assert isinstance(result, np.ndarray)
    assert len(result) == len(waveform)
    assert not np.any(np.isnan(result))
    assert not np.any(np.isinf(result))
    
    # Test parameter validation
    params = effect._validate_params(None)
    assert isinstance(params, dict)
    assert all(isinstance(v, float) for v in params.values())
    
    # Test cache key generation
    key1 = effect._get_cache_key(waveform, params)
    key2 = effect._get_cache_key(waveform, params)
    assert key1 == key2  # Same input should produce same cache key
