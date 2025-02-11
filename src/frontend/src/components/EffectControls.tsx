/**
 * File: EffectControls.tsx
 * Purpose: Implements a folder-style tab system for managing audio effects with bypass toggles
 * Date: 2025-02-10
 */

import React, { useState, useEffect } from 'react';
import { Effect, EffectManager } from '../effects/EffectManager';
import './EffectControls.css';

interface EffectControlsProps {
    effectManager: EffectManager;
    onEffectChange: () => void;
    isProcessing: boolean;
}

export const EffectControls: React.FC<EffectControlsProps> = ({
    effectManager,
    onEffectChange,
    isProcessing
}) => {
    // Track which effect tab is currently active
    const [activeTab, setActiveTab] = useState<string>('chaosFold');
    const effects = effectManager.getEffects();

    // Handle changes to effect parameters
    const handleParameterChange = (effectId: string, paramId: string, value: number) => {
        effectManager.updateEffectParameter(effectId, paramId, value);
        onEffectChange();
    };

    // Toggle whether an effect is bypassed
    const handleBypassToggle = (effectId: string) => {
        effectManager.toggleBypass(effectId);
        onEffectChange();
    };

    return (
        <div className="effects-controls">
            {/* Tab navigation */}
            <div className="effect-tabs">
                {effects.map((effect) => (
                    <div
                        key={effect.id}
                        className={`tab ${activeTab === effect.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(effect.id)}
                    >
                        {effect.name}
                    </div>
                ))}
            </div>

            {/* Effect panels */}
            <div className="effect-panels">
                {effects.map((effect) => {
                    const isBypassed = effectManager.isEffectBypassed(effect.id);
                    
                    return (
                        <div
                            key={effect.id}
                            className={`effect-panel ${activeTab === effect.id ? 'active' : ''} ${
                                isBypassed ? 'bypassed' : ''
                            }`}
                        >
                            {/* Effect header with bypass toggle */}
                            <div className="effect-header">
                                <h3>{effect.name}</h3>
                                <div className={`bypass-toggle ${!isBypassed ? 'active' : ''}`}>
                                    <label 
                                        className="switch" 
                                        title={`${isBypassed ? 'Enable' : 'Bypass'} ${effect.name}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!isBypassed}
                                            onChange={() => handleBypassToggle(effect.id)}
                                            disabled={isProcessing}
                                        />
                                        <span className="slider round"></span>
                                    </label>
                                </div>
                            </div>

                            {/* Effect parameters */}
                            <div className="effect-parameters">
                                {effect.parameters.map((param) => (
                                    <div key={param.id} className="parameter-control">
                                        <label>
                                            {param.name}
                                            <div className="parameter-input">
                                                <input
                                                    type="range"
                                                    min={param.min}
                                                    max={param.max}
                                                    step={param.step}
                                                    value={param.value}
                                                    onChange={(e) =>
                                                        handleParameterChange(
                                                            effect.id,
                                                            param.id,
                                                            parseFloat(e.target.value)
                                                        )
                                                    }
                                                    disabled={isBypassed || isProcessing}
                                                />
                                                <span className="param-value">
                                                    {param.value.toFixed(2)}
                                                </span>
                                            </div>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
