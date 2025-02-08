import React, { useState, useEffect } from 'react';
import { EffectManager, EffectRegistry, EffectParameter } from '../effects/EffectManager';
import './EffectControls.css';

interface EffectControlsProps {
  effectManager: EffectManager;
  onEffectChange: (effectName: string, parameters: Record<string, any>) => void;
}

export const EffectControls: React.FC<EffectControlsProps> = ({
  effectManager,
  onEffectChange,
}) => {
  const [effects, setEffects] = useState<EffectRegistry>({});
  const [selectedEffect, setSelectedEffect] = useState<string>('');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadEffects();
  }, []);

  const loadEffects = async () => {
    try {
      const availableEffects = await effectManager.loadEffects();
      setEffects(availableEffects);
      setError('');

      // Select first effect by default
      if (Object.keys(availableEffects).length > 0) {
        const firstEffect = Object.keys(availableEffects)[0];
        setSelectedEffect(firstEffect);
        initializeParameters(firstEffect, availableEffects[firstEffect].parameters);
      }
    } catch (error) {
      console.error('Failed to load effects:', error);
      setError('Failed to load effects');
    }
  };

  const validateParameter = (value: any, param: EffectParameter): number => {
    let numValue = typeof value === 'string' ? parseFloat(value) : value;

    // Handle NaN
    if (isNaN(numValue)) {
      return param.default;
    }

    // Clamp to range
    if (param.min !== undefined) {
      numValue = Math.max(param.min, numValue);
    }
    if (param.max !== undefined) {
      numValue = Math.min(param.max, numValue);
    }

    return numValue;
  };

  const initializeParameters = (effectName: string, params: Record<string, EffectParameter>) => {
    const initialParams = Object.entries(params).reduce((acc, [key, param]) => {
      acc[key] = param.default;
      return acc;
    }, {} as Record<string, any>);

    setParameters(initialParams);
    onEffectChange(effectName, initialParams);
  };

  const handleEffectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newEffect = event.target.value;
    setSelectedEffect(newEffect);
    setError('');

    const effectParams = effects[newEffect].parameters;
    initializeParameters(newEffect, effectParams);
  };

  const handleParameterChange = (paramName: string, value: any) => {
    try {
      const param = effects[selectedEffect].parameters[paramName];
      const validatedValue = validateParameter(value, param);

      const newParameters = {
        ...parameters,
        [paramName]: validatedValue,
      };

      setParameters(newParameters);
      onEffectChange(selectedEffect, newParameters);
      setError('');
    } catch (err) {
      console.error('Error updating parameter:', err);
      setError('Failed to update parameter');
    }
  };

  return (
    <div className="effect-controls">
      <div className="effect-selector">
        <label>
          Effect:
          <select value={selectedEffect} onChange={handleEffectChange}>
            {Object.entries(effects).map(([name, effect]) => (
              <option key={name} value={name}>
                {name.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="error-message">{error}</div>}

      {selectedEffect && effects[selectedEffect] && (
        <div className="parameter-controls">
          {Object.entries(effects[selectedEffect].parameters).map(([name, param]) => (
            <div key={name} className="parameter-control">
              <label>
                {name}:
                <input
                  type="range"
                  min={param.min}
                  max={param.max}
                  step={param.type === 'float' ? 0.001 : 1}
                  value={parameters[name]}
                  onChange={(e) => handleParameterChange(name, e.target.value)}
                />
                <span>{Number(parameters[name]).toFixed(3)}</span>
              </label>
              <small>{param.description}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
