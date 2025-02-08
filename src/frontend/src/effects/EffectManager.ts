import { API_BASE } from '../config';

export interface EffectParameter {
  type: string;
  min?: number;
  max?: number;
  default: any;
  description: string;
}

export interface Effect {
  parameters: Record<string, EffectParameter>;
}

export interface EffectRegistry {
  [key: string]: Effect;
}

export class EffectManager {
  private effects: EffectRegistry = {};
  
  async loadEffects(): Promise<EffectRegistry> {
    try {
      const response = await fetch(`${API_BASE}/api/effects`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load effects');
      }
      
      this.effects = await response.json();
      return this.effects;
    } catch (error) {
      console.error('Error loading effects:', error);
      throw error;
    }
  }
  
  async applyEffect(
    effectName: string,
    waveform: number[],
    parameters: Record<string, any>,
    frames?: number[][]
  ): Promise<{ waveform: number[], frames: number[][] }> {
    try {
      const response = await fetch(`${API_BASE}/api/effects/apply`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          effect: effectName,
          waveform,
          parameters,
          frames
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to apply effect');
      }

      return await response.json();
    } catch (error) {
      console.error(`Error applying effect ${effectName}:`, error);
      throw error;
    }
  }
  
  getEffectParameters(effectName: string): Record<string, EffectParameter> | null {
    return this.effects[effectName]?.parameters || null;
  }
  
  getAllEffects(): EffectRegistry {
    return this.effects;
  }
}
