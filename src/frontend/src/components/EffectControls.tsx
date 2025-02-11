/**
 * File: EffectControls.tsx
 * Purpose: Implements a folder-style tab system for managing audio effects with bypass toggles
 * Date: 2025-02-10
 */

import React, { useState, useCallback } from 'react';
import { Effect, EffectManager } from '../effects/EffectManager';
import './EffectControls.css';
import ErrorBoundary from './ErrorBoundary';
import { useSliderInteraction } from '../hooks/useSliderInteraction';

interface Props {
    effectManager: EffectManager;
    onEffectChange: () => void;
    isProcessing: boolean;
}

export const EffectControls: React.FC<Props> = ({
    effectManager,
    onEffectChange,
    isProcessing
}) => {
    const [activeTab, setActiveTab] = useState<string>('chaosFold');
    const effects = effectManager.getEffects();

    // Handle changes to effect parameters
    const handleParameterChange = useCallback((effectId: string, paramId: string, value: number) => {
        try {
            effectManager.updateEffectParameter(effectId, paramId, value);
            onEffectChange();
        } catch (error) {
            console.error('Error updating parameter:', error);
        }
    }, [effectManager, onEffectChange]);

    // Toggle whether an effect is bypassed
    const handleBypassToggle = useCallback((effectId: string) => {
        effectManager.toggleBypass(effectId);
        onEffectChange();
    }, [effectManager, onEffectChange]);

    return (
        <ErrorBoundary>
            <div className="effects-controls">
                {/* Tab navigation */}
                <div className="effect-tabs">
                    {effects.map((effect) => (
                        <button
                            key={effect.id}
                            className={`tab ${activeTab === effect.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(effect.id)}
                        >
                            {effect.name}
                        </button>
                    ))}
                </div>

                {/* Effect panels */}
                <div className="effect-panels">
                    {effects.map((effect) => {
                        const isBypassed = effectManager.isEffectBypassed(effect.id);

                        return (
                            <div
                                key={effect.id}
                                className={`effect-panel ${activeTab === effect.id ? 'active' : ''}`}
                            >
                                {/* Effect header with bypass toggle */}
                                <div className="effect-header">
                                    <h3>{effect.name}</h3>
                                    <label className="bypass-toggle">
                                        <input
                                            type="checkbox"
                                            checked={!isBypassed}
                                            onChange={() => handleBypassToggle(effect.id)}
                                            disabled={isProcessing}
                                        />
                                        <span className="toggle-label">
                                            {isBypassed ? 'Bypassed' : 'Active'}
                                        </span>
                                    </label>
                                </div>

                                {/* Effect parameters */}
                                <div className="effect-parameters">
                                    {effect.parameters.map((param) => {
                                        const { handleChange, handleDragStart, handleDragEnd } = useSliderInteraction({
                                            onChange: (value) => handleParameterChange(effect.id, param.id, value),
                                            disabled: isBypassed || isProcessing
                                        });

                                        return (
                                            <div key={param.id} className="parameter-control">
                                                <label>
                                                    <span className="param-label">{param.name}</span>
                                                    <div className="parameter-input">
                                                        <input
                                                            type="range"
                                                            min={param.min}
                                                            max={param.max}
                                                            step={param.step}
                                                            value={param.value}
                                                            onChange={(e) => handleChange(parseFloat(e.target.value))}
                                                            onMouseDown={handleDragStart}
                                                            onMouseUp={handleDragEnd}
                                                            onTouchStart={handleDragStart}
                                                            onTouchEnd={handleDragEnd}
                                                            disabled={isBypassed || isProcessing}
                                                        />
                                                        <span className="param-value">
                                                            {param.value.toFixed(2)}
                                                        </span>
                                                        {param.description && (
                                                            <span 
                                                                className="param-description" 
                                                                title={param.description}
                                                                aria-label={param.description}
                                                            >
                                                                <i className="fas fa-info-circle" />
                                                            </span>
                                                        )}
                                                    </div>
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </ErrorBoundary>
    );
};
