from typing import Dict, Type
from . import WaveEffect
from .gain import GainEffect
from .chaos_fold import ChaosFoldEffect

class EffectRegistry:
    """Registry for all available effects"""
    
    def __init__(self):
        self._effects: Dict[str, WaveEffect] = {}
        self._register_defaults()
    
    def _register_defaults(self):
        """Register default effects"""
        self.register(GainEffect())
        self.register(ChaosFoldEffect())
    
    def register(self, effect: WaveEffect):
        """Register a new effect"""
        self._effects[effect.name] = effect
    
    def get_effect(self, name: str) -> WaveEffect:
        """Get an effect by name"""
        if name not in self._effects:
            raise KeyError(f"Effect {name} not found")
        return self._effects[name]
    
    def get_all_effects(self) -> Dict[str, Dict]:
        """Get all registered effects and their parameters"""
        return {
            name: {
                "parameters": effect.parameters
            }
            for name, effect in self._effects.items()
        }

# Global registry instance
registry = EffectRegistry()
