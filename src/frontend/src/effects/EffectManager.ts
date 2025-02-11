/**
 * File: EffectManager.ts
 * Purpose: Manages audio effects and their state for the wavetable synthesizer.
 * Date: 2025-02-10
 */

import { API_BASE } from '../config';

/**
 * Represents a parameter for an audio effect
 */
export interface EffectParameter {
    /** Unique identifier for the parameter */
    id: string;
    /** Display name of the parameter */
    name: string;
    /** Type of parameter (e.g., 'range') */
    type: string;
    /** Current value of the parameter */
    value: number;
    /** Minimum allowed value */
    min: number;
    /** Maximum allowed value */
    max: number;
    /** Step size for value changes */
    step: number;
    /** Default value */
    default: number;
    /** Parameter description */
    description?: string;
}

/**
 * Represents an audio effect with its parameters and state
 */
export interface Effect {
    /** Unique identifier for the effect */
    id: string;
    /** Display name of the effect */
    name: string;
    /** List of effect parameters */
    parameters: EffectParameter[];
    /** Whether the effect is currently bypassed */
    bypassed?: boolean;
}

/**
 * Response from the backend effect API
 */
interface EffectResponse {
    waveform: number[];
    error?: string;
}

/**
 * Manages the state and processing of audio effects
 */
export class EffectManager {
    /** List of available effects */
    private effects: Effect[] = [];
    /** Set of bypassed effect IDs */
    private bypassedEffects: Set<string> = new Set();
    /** Cache for computed values to optimize performance */
    private computeCache: Map<string, { params: Record<string, number>, result: number[] }> = new Map();
    /** Debounce timers for parameter updates */
    private updateTimers: Map<string, number> = new Map();

    constructor() {
        // Initialize with default effects
        this.effects = [
            {
                id: 'chaosFold',
                name: 'Chaos Fold',
                parameters: [
                    {
                        id: 'beta',
                        name: 'Beta',
                        type: 'range',
                        value: 0.5,
                        min: 0,
                        max: 2,
                        step: 0.01,
                        default: 0.5,
                        description: 'Controls folding strength (higher = more chaotic)'
                    },
                    {
                        id: 'timeStep',
                        name: 'Time Step',
                        type: 'range',
                        value: 0.01,
                        min: 0.001,
                        max: 0.1,
                        step: 0.001,
                        default: 0.01,
                        description: 'Governs time evolution of the attractor'
                    },
                    {
                        id: 'mix',
                        name: 'Mix',
                        type: 'range',
                        value: 1,
                        min: 0,
                        max: 1,
                        step: 0.01,
                        default: 1,
                        description: 'Blends between original and folded waveform'
                    },
                    {
                        id: 'sigma',
                        name: 'Sigma',
                        type: 'range',
                        value: 10,
                        min: 0,
                        max: 20,
                        step: 0.1,
                        default: 10,
                        description: 'Controls sensitivity to input waveform'
                    },
                    {
                        id: 'rho',
                        name: 'Rho',
                        type: 'range',
                        value: 28,
                        min: 0,
                        max: 50,
                        step: 0.1,
                        default: 28,
                        description: 'Governs feedback intensity in the attractor'
                    },
                    {
                        id: 'foldSymmetry',
                        name: 'Fold Symmetry',
                        type: 'range',
                        value: 0.5,
                        min: 0,
                        max: 1,
                        step: 0.01,
                        default: 0.5,
                        description: 'Adjusts waveform folding symmetry'
                    },
                    {
                        id: 'complexity',
                        name: 'Wave Complexity',
                        type: 'range',
                        value: 0.5,
                        min: 0,
                        max: 1,
                        step: 0.01,
                        default: 0.5,
                        description: 'Introduces higher-order harmonics'
                    },
                    {
                        id: 'lfoAmount',
                        name: 'LFO Amount',
                        type: 'range',
                        value: 0,
                        min: 0,
                        max: 1,
                        step: 0.01,
                        default: 0,
                        description: 'Adds modulation to the wavefolding'
                    }
                ],
                bypassed: false
            }
        ];
    }

    /**
     * Get all available effects
     * @returns List of effects with their current state
     */
    getEffects(): Effect[] {
        return this.effects.map(effect => ({
            ...effect,
            bypassed: this.isEffectBypassed(effect.id)
        }));
    }

    /**
     * Update a parameter value for a specific effect
     * @param effectId - ID of the effect to update
     * @param paramId - ID of the parameter to update
     * @param value - New value for the parameter
     */
    updateEffectParameter(effectId: string, paramId: string, value: number): void {
        const effect = this.effects.find(e => e.id === effectId);
        if (effect) {
            const param = effect.parameters.find(p => p.id === paramId);
            if (param) {
                // Clamp value to parameter range
                param.value = Math.max(param.min, Math.min(param.max, value));
                // Clear cache when parameters change
                this.clearComputeCache(effectId);
                // Debounce parameter updates
                this.debounceParameterUpdate(effectId);
            }
        }
    }

    /**
     * Debounce parameter updates to prevent overwhelming the backend
     * @param effectId - ID of the effect being updated
     */
    private debounceParameterUpdate(effectId: string): void {
        const timer = this.updateTimers.get(effectId);
        if (timer) {
            window.clearTimeout(timer);
        }
        this.updateTimers.set(effectId, window.setTimeout(() => {
            this.updateTimers.delete(effectId);
            // Notify listeners that parameters have changed
            this.onParametersChanged(effectId);
        }, 50)); // 50ms debounce
    }

    /**
     * Handle parameter changes and notify listeners
     * @param effectId - ID of the effect that changed
     */
    private onParametersChanged(effectId: string): void {
        // Notify listeners of parameter changes
        const event = new CustomEvent('effect-parameters-changed', {
            detail: { effectId, effect: this.effects.find(e => e.id === effectId) }
        });
        window.dispatchEvent(event);
    }

    /**
     * Toggle the bypass state of an effect
     * @param effectId - ID of the effect to toggle
     */
    toggleBypass(effectId: string): void {
        if (this.bypassedEffects.has(effectId)) {
            this.bypassedEffects.delete(effectId);
        } else {
            this.bypassedEffects.add(effectId);
        }

        // Update the effect's bypassed state
        const effect = this.effects.find(e => e.id === effectId);
        if (effect) {
            effect.bypassed = this.bypassedEffects.has(effectId);
            // Notify listeners of bypass change
            this.onParametersChanged(effectId);
        }
    }

    /**
     * Check if an effect is currently bypassed
     * @param effectId - ID of the effect to check
     * @returns True if the effect is bypassed, false otherwise
     */
    isEffectBypassed(effectId: string): boolean {
        return this.bypassedEffects.has(effectId);
    }

    /**
     * Clear the compute cache for an effect
     * @param effectId - ID of the effect to clear cache for
     */
    private clearComputeCache(effectId: string): void {
        this.computeCache.delete(effectId);
    }

    /**
     * Get a cache key for the current effect parameters
     * @param effectId - ID of the effect
     * @param parameters - Current parameter values
     * @returns Cache key string
     */
    private getCacheKey(effectId: string, parameters: Record<string, number>): string {
        return `${effectId}:${JSON.stringify(parameters)}`;
    }

    /**
     * Apply all active (non-bypassed) effects to the waveform data
     * @param waveformData - Array of waveform samples to process
     * @returns Promise resolving to the processed waveform data
     */
    async applyEffects(waveformData: number[]): Promise<number[]> {
        let processedData = [...waveformData];
        
        // Process each non-bypassed effect in sequence
        for (const effect of this.effects) {
            if (!this.isEffectBypassed(effect.id)) {
                const parameters = effect.parameters.reduce((acc, param) => {
                    acc[param.id] = param.value;
                    return acc;
                }, {} as Record<string, number>);

                try {
                    const response = await fetch(`${API_BASE}/api/effects/apply`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            effectId: effect.id,
                            waveform: processedData,
                            parameters
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to apply effect ${effect.name}`);
                    }

                    const result: EffectResponse = await response.json();
                    if (result.error) {
                        throw new Error(result.error);
                    }
                    processedData = result.waveform;

                    // Cache the result
                    this.computeCache.set(this.getCacheKey(effect.id, parameters), {
                        params: parameters,
                        result: [...result.waveform]
                    });
                } catch (error) {
                    console.error(`Error applying effect ${effect.name}:`, error);
                    // Don't throw, just continue with unprocessed data
                    continue;
                }
            }
        }

        return processedData;
    }
}
