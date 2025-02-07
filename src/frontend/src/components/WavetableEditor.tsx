import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import './WavetableEditor.css';

// Utility function to bound values between -1 and 1
const boundValue = (value: number): number => {
  return Math.max(-1, Math.min(1, value));
};

interface WaveformData {
  waveform: number[];
  frames: number[][];
  spectrum: number[];
  frame_size: number;
  num_frames: number;
  type?: string;
  equation?: string;
}

interface WaveformMeshProps {
  frames: number[][];
  gain?: number;
}

const WaveformMesh: React.FC<WaveformMeshProps> = ({ frames, gain = 1.0 }) => {
  const meshRef = useRef<THREE.LineSegments>(null);
  
  const geometry = useMemo(() => {
    if (!frames?.length) return new THREE.BufferGeometry();

    const geometry = new THREE.BufferGeometry();
    const numFrames = frames.length;
    const frameSize = frames[0]?.length || 0;
    
    if (!frameSize) return geometry;

    const vertices: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color('#ff3333');
    
    // Sample every 4th frame and every 4th point
    for (let i = 0; i < numFrames; i += 4) {
      const frame = frames[i];
      const z = (i / (numFrames - 1)) * 2 - 1;
      
      for (let j = 0; j < frameSize - 4; j += 4) {
        const x1 = (j / (frameSize - 1)) * 2 - 1;
        const x2 = ((j + 4) / (frameSize - 1)) * 2 - 1;
        const y1 = boundValue(frame[j] * gain);
        const y2 = boundValue(frame[j + 4] * gain);
        
        vertices.push(x1, y1, z);
        vertices.push(x2, y2, z);
        
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    return geometry;
  }, [frames, gain]);

  useEffect(() => {
    if (!meshRef.current || !frames?.length) return;
    
    const numFrames = frames.length;
    const frameSize = frames[0]?.length || 0;
    if (!frameSize) return;

    const vertices: number[] = [];
    
    // Sample every 4th frame and every 4th point
    for (let i = 0; i < numFrames; i += 4) {
      const frame = frames[i];
      const z = (i / (numFrames - 1)) * 2 - 1;
      
      for (let j = 0; j < frameSize - 4; j += 4) {
        const x1 = (j / (frameSize - 1)) * 2 - 1;
        const x2 = ((j + 4) / (frameSize - 1)) * 2 - 1;
        const y1 = boundValue(frame[j] * gain);
        const y2 = boundValue(frame[j + 4] * gain);
        
        vertices.push(x1, y1, z);
        vertices.push(x2, y2, z);
      }
    }

    const positions = meshRef.current.geometry.attributes.position;
    positions.array.set(vertices);
    positions.needsUpdate = true;
  }, [frames, gain]);

  return (
    <lineSegments ref={meshRef} geometry={geometry}>
      <lineBasicMaterial 
        color="#ff3333"
        transparent
        opacity={0.7}
        linewidth={2.5}
        toneMapped={false}
      />
    </lineSegments>
  );
};

// Simplified ThreeDView with stable camera
const ThreeDView: React.FC<{ frames: number[][], gain: number }> = ({ frames, gain }) => {
  return (
    <div className="canvas-container" style={{ width: '100%', height: '400px' }}>
      <Canvas 
        camera={{ 
          position: [2, 2, 2], 
          fov: 45
        }}
        gl={{ 
          antialias: true
        }}
      >
        <color attach="background" args={['#1a1a1a']} />
        <WaveformMesh frames={frames} gain={gain} />
        <OrbitControls 
          enableDamping={true}
          dampingFactor={0.05}
          rotateSpeed={0.5}
        />
        <gridHelper args={[2, 10, '#404040', '#303030']} />
        <axesHelper args={[1]} />
        
        <EffectComposer>
          <Bloom 
            intensity={1.5}
            luminanceThreshold={0.1}
            luminanceSmoothing={0.9}
            height={300}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

const WavetableEditor: React.FC = () => {
  // Change default equation to a simple sine wave instead of a morphing wave
  const [equation, setEquation] = useState<string>('sin(t)');
  const [numFrames, setNumFrames] = useState<number>(256);
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [harmonicStrength, setHarmonicStrength] = useState<number>(0);
  const [gain, setGain] = useState<number>(1.0);
  const [isDraggingFormant, setIsDraggingFormant] = useState<boolean>(false);
  const [isDraggingGain, setIsDraggingGain] = useState<boolean>(false);
  const [chaosParams, setChaosParams] = useState({
    sigma: 5,
    rho: 14,
    beta: 1.33,
    dt: 0.005
  });
  const [isChaosEnabled, setIsChaosEnabled] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [debouncedParams, setDebouncedParams] = useState(chaosParams);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const harmonicTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastEnhanceTime = useRef<number>(0);
  const originalWaveformRef = useRef<WaveformData | null>(null);
  const lastValidWaveformRef = useRef<WaveformData | null>(null);

  const API_BASE = 'http://localhost:8081';

  const fetchWithCredentials = async (url: string, options: RequestInit = {}) => {
    const defaultOptions: RequestInit = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    };

    const response = await fetch(url, defaultOptions);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }
    return response;
  };

  // Store original waveform when it's first generated
  useEffect(() => {
    if (waveformData && (!originalWaveformRef.current || equation !== originalWaveformRef.current.equation)) {
      try {
        originalWaveformRef.current = {
          ...waveformData,
          frames: waveformData.frames.map(frame => [...frame]),
          waveform: [...waveformData.waveform],
          equation: equation,
          type: waveformData.type || 'custom'
        };
      } catch (err) {
        console.error('Error storing original waveform:', err);
        setError('Failed to store original waveform data');
      }
    }
  }, [waveformData, equation]);

  useEffect(() => {
    // Generate initial sine wave
    handleBasicWaveform('sine').catch(err => {
      console.error('Error generating initial sine wave:', err);
      setError('Failed to generate initial waveform');
    });
  }, []); // Only run once on mount

  // Simple preview of formant effect for immediate visual feedback
  const previewFormantEffect = (frame: number[], strength: number) => {
    if (!frame || frame.length === 0) return frame;
    
    // Create a simple approximation that maintains the overall shape
    return frame.map(y => {
      const sign = Math.sign(y);
      const abs = Math.abs(y);
      
      if (strength > 0) {
        // Enhance peaks while preserving shape
        return sign * (abs + strength * abs * (1 - abs));
      } else {
        // Reduce peaks while preserving shape
        return sign * (abs + strength * abs * abs);
      }
    });
  };

  const updateVisualPreview = (strength: number) => {
    if (!waveformData || !originalWaveformRef.current) return;
    
    // Simple preview effect while dragging
    const previewFrames = originalWaveformRef.current.frames.map(frame =>
      frame.map(sample => {
        const enhanced = sample * (1 + strength * 0.5);
        return Math.max(-1, Math.min(1, enhanced));
      })
    );

    setWaveformData(prev => ({
      ...prev,
      frames: previewFrames,
      waveform: previewFrames[0]
    }));

    if (canvasRef.current) {
      drawWaveform(canvasRef.current, previewFrames[0]);
    }
  };

  const generateWaveform = async () => {
    try {
      setError(null);
      setActivePreset(null); // Clear active preset when generating custom equation
      
      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/equation`, {
        method: 'POST',
        body: JSON.stringify({
          equation,
          frames: numFrames
        }),
      });

      const data = await response.json();
      
      // Reset harmonic strength when generating new waveform
      setHarmonicStrength(0);
      
      // Store the original data with equation
      const newWaveformData = {
        ...data,
        type: 'custom',
        equation: equation // Store the custom equation
      };
      
      setWaveformData(newWaveformData);
      originalWaveformRef.current = {
        ...newWaveformData,
        frames: newWaveformData.frames.map(frame => [...frame]),
        waveform: [...newWaveformData.waveform]
      };
      
      if (canvasRef.current) {
        drawWaveform(canvasRef.current, data.waveform);
      }
    } catch (err) {
      console.error('Error generating waveform:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate waveform');
    }
  };

  const handleBasicWaveform = async (type: string) => {
    try {
      setError(null);
      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/basic?type=${type}&frames=${numFrames}`);
      const data = await response.json();
      setWaveformData(data);
      
      if (canvasRef.current) {
        drawWaveform(canvasRef.current, data.waveform);
      }
    } catch (err) {
      console.error('Error generating waveform:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate waveform');
    }
  };

  const handleSpectralEffectChange = async (effect: 'formant' | 'gain', value: number) => {
    if (effect === 'formant') {
      setHarmonicStrength(value);
    } else if (effect === 'gain') {
      setGain(value);
    }
    
    if (!originalWaveformRef.current) return;
    
    try {
      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/apply_effects`, {
        method: 'POST',
        body: JSON.stringify({
          frames: originalWaveformRef.current.frames,
          formant: effect === 'formant' ? value : harmonicStrength,
          gain: effect === 'gain' ? value : gain
        })
      });

      const data = await response.json();
      if (!data || !Array.isArray(data.frames)) {
        throw new Error('Invalid response from server');
      }

      setWaveformData(prev => ({
        ...prev,
        ...data,
        type: prev.type,
        equation: prev.equation
      }));

      if (canvasRef.current) {
        drawWaveform(canvasRef.current, data.waveform);
      }
    } catch (err) {
      console.error('Effect application error:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply effects');
    }
  };

  const enhanceHarmonics = async () => {
    if (!waveformData || !originalWaveformRef.current) return;

    const now = Date.now();
    if (now - lastEnhanceTime.current < 50) return;
    lastEnhanceTime.current = now;

    try {
      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/enhance`, {
        method: 'POST',
        body: JSON.stringify({
          frames: originalWaveformRef.current.frames,
          strength: harmonicStrength,
          type: originalWaveformRef.current.type
        }),
      });

      const enhancedData = await response.json();
      
      if (!isDraggingFormant) {
        // Update waveform data while preserving type and equation
        setWaveformData(prev => ({
          ...prev,
          frames: enhancedData.frames,
          waveform: enhancedData.frames[0],
          spectrum: enhancedData.spectrum || prev.spectrum,
          type: originalWaveformRef.current?.type || prev.type,
          equation: originalWaveformRef.current?.equation || prev.equation // Preserve the original equation
        }));

        if (canvasRef.current) {
          drawWaveform(canvasRef.current, enhancedData.frames[0]);
        }
      }
    } catch (err) {
      console.error('Error enhancing harmonics:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while enhancing harmonics');
    }
  };

  const sanitizeNumber = (value: number): number => {
    const num = Number(value);
    return isNaN(num) ? 0 : Number(num.toFixed(4));
  };

  const optimizeNumericArray = (arr: number[]): number[] => {
    return arr.map(x => sanitizeNumber(x));
  };

  const normalizeArray = (arr: number[]): number[] => {
    const max = Math.max(...arr.map(Math.abs));
    return max === 0 ? arr : arr.map(x => x / max);
  };

  const applyChaosFolder = async () => {
    if (!waveformData || !originalWaveformRef.current) {
      setError('No waveform data available');
      return;
    }

    try {
      setError(null);
      setIsProcessing(true);
      
      // Process frames data
      const frames = originalWaveformRef.current.frames.map(frame => 
        frame.map(value => {
          const num = Number(value);
          if (isNaN(num)) {
            throw new Error('Frame values must be numbers');
          }
          return boundValue(num);
        })
      );

      const params = {
        sigma: Number(debouncedParams.sigma),
        rho: Number(debouncedParams.rho),
        beta: Number(debouncedParams.beta),
        dt: Number(debouncedParams.dt)
      };

      // Validate parameters
      Object.entries(params).forEach(([key, value]) => {
        if (isNaN(value)) {
          throw new Error(`Invalid ${key} parameter: ${value}`);
        }
      });

      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/chaos_fold`, {
        method: 'POST',
        body: JSON.stringify({
          frames,
          ...params
        })
      });

      const data = await response.json();
      
      if (!data || !Array.isArray(data.frames) || !Array.isArray(data.waveform)) {
        throw new Error('Invalid response from server');
      }

      // Ensure all values stay within bounds
      data.frames = data.frames.map(frame => frame.map(v => boundValue(v)));
      data.waveform = data.waveform.map(v => boundValue(v));

      const newWaveformData: WaveformData = {
        ...data,
        type: waveformData.type || 'custom',
        equation: waveformData.equation || ''
      };

      setWaveformData(newWaveformData);

      if (canvasRef.current) {
        drawWaveform(canvasRef.current, data.waveform);
      }
    } catch (err) {
      console.error('Chaos folder error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while applying chaos folder');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedParams(chaosParams);
    }, 100);
    return () => clearTimeout(timer);
  }, [chaosParams]);

  useEffect(() => {
    if (isChaosEnabled && originalWaveformRef.current) {
      applyChaosFolder();
    }
  }, [debouncedParams, isChaosEnabled]);

  const drawWaveform = (canvas: HTMLCanvasElement, data: number[]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !data.length) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    const scaleY = height / 4;

    ctx.clearRect(0, 0, width, height);
    
    // Draw center line
    ctx.beginPath();
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Draw boundary lines at +1 and -1
    ctx.beginPath();
    ctx.strokeStyle = '#303030';
    ctx.setLineDash([5, 5]);
    ctx.moveTo(0, centerY - scaleY);
    ctx.lineTo(width, centerY - scaleY);
    ctx.moveTo(0, centerY + scaleY);
    ctx.lineTo(width, centerY + scaleY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 2;

    data.forEach((y, i) => {
      const x = (i / data.length) * width;
      // Ensure y value stays within bounds
      const scaledY = boundValue(y * gain);
      if (i === 0) {
        ctx.moveTo(x, centerY + scaledY * scaleY);
      } else {
        ctx.lineTo(x, centerY + scaledY * scaleY);
      }
    });

    ctx.stroke();
  };

  const downloadWaveform = async () => {
    if (!waveformData || !waveformData.frames) {
      setError('No waveform data to download');
      return;
    }

    try {
      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/download`, {
        method: 'POST',
        body: JSON.stringify({
          frames: waveformData.frames,
          gain: gain
        }),
      });

      // Create a blob from the response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link and click it
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wavetable.wav';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error downloading waveform:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while downloading');
    }
  };

  const renderChaosControls = () => (
    <div className="chaos-controls">
      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={isChaosEnabled}
            onChange={(e) => setIsChaosEnabled(e.target.checked)}
            disabled={isProcessing}
          />
          Enable Chaos
        </label>
      </div>
      
      {isChaosEnabled && (
        <>
          <div className="control-group">
            <label>Sigma: {chaosParams.sigma.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={chaosParams.sigma}
              onChange={(e) => setChaosParams(prev => ({ ...prev, sigma: Number(e.target.value) }))}
              disabled={isProcessing}
            />
          </div>
          
          <div className="control-group">
            <label>Rho: {chaosParams.rho.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="28"
              step="0.1"
              value={chaosParams.rho}
              onChange={(e) => setChaosParams(prev => ({ ...prev, rho: Number(e.target.value) }))}
              disabled={isProcessing}
            />
          </div>
          
          <div className="control-group">
            <label>Beta: {chaosParams.beta.toFixed(3)}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={chaosParams.beta}
              onChange={(e) => setChaosParams(prev => ({ ...prev, beta: Number(e.target.value) }))}
              disabled={isProcessing}
            />
          </div>
          
          <div className="control-group">
            <label>Time Step: {chaosParams.dt.toFixed(4)}</label>
            <input
              type="range"
              min="0.001"
              max="0.01"
              step="0.001"
              value={chaosParams.dt}
              onChange={(e) => setChaosParams(prev => ({ ...prev, dt: Number(e.target.value) }))}
              disabled={isProcessing}
            />
          </div>
          
          {isProcessing && (
            <div className="processing-indicator">Processing...</div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="wavetable-editor">
      <div className="editor-header">
        <h2>Wavetable Editor</h2>
        <p className="description">
          Create and visualize wavetables using mathematical equations. Use variables 't' for time and 'frame' for morphing.
        </p>
      </div>
      
      <div className="editor-controls">
        <div className="input-group">
          <label htmlFor="equation">Equation:</label>
          <input
            id="equation"
            type="text"
            value={equation}
            onChange={(e) => setEquation(e.target.value)}
            placeholder="Enter equation (e.g., sin(t))"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                generateWaveform();
              }
            }}
          />
        </div>
        <button 
          onClick={generateWaveform} 
          className="generate-btn"
          type="button"
        >
          Generate Waveform
        </button>
        {waveformData && (
          <button 
            onClick={downloadWaveform} 
            className="generate-btn"
            type="button"
          >
            Download WAV
          </button>
        )}
      </div>

      <div className="control-panel">
        <div className="basic-waveforms">
          <button 
            onClick={() => handleBasicWaveform('sine')}
            className={activePreset === 'sine' ? 'active' : ''}
          >
            Sine
          </button>
          <button 
            onClick={() => handleBasicWaveform('square')}
            className={activePreset === 'square' ? 'active' : ''}
          >
            Square
          </button>
          <button 
            onClick={() => handleBasicWaveform('sawtooth')}
            className={activePreset === 'sawtooth' ? 'active' : ''}
          >
            Sawtooth
          </button>
          <button 
            onClick={() => handleBasicWaveform('triangle')}
            className={activePreset === 'triangle' ? 'active' : ''}
          >
            Triangle
          </button>
        </div>

        <div className="frame-control">
          <label htmlFor="frames">
            Frames:
            <input
              id="frames"
              type="number"
              value={numFrames}
              onChange={(e) => setNumFrames(parseInt(e.target.value))}
              min="1"
              max="256"
            />
          </label>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="visualization">
        <div className="view-controls">
          <button
            onClick={() => setViewMode('2d')}
            className={viewMode === '2d' ? 'active' : ''}
          >
            2D View
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className={viewMode === '3d' ? 'active' : ''}
          >
            3D View
          </button>
        </div>

        {waveformData && waveformData.frames && waveformData.frames.length > 0 && (
          <>
            <div className="waveform-view">
              {viewMode === '2d' ? (
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                />
              ) : (
                <ThreeDView 
                  frames={waveformData.frames} 
                  gain={gain}
                />
              )}
            </div>

            <div className="spectral-controls">
              <h3>Spectral Effects</h3>
              <div className="effect-group">
                <label htmlFor="harmonic-strength">
                  Formant Filter:
                  <input
                    id="harmonic-strength"
                    type="range"
                    value={harmonicStrength}
                    min="-1"
                    max="1"
                    step="0.01"
                    onMouseDown={() => setIsDraggingFormant(true)}
                    onMouseUp={() => {
                      setIsDraggingFormant(false);
                      enhanceHarmonics();
                    }}
                    onMouseLeave={() => {
                      if (isDraggingFormant) {
                        setIsDraggingFormant(false);
                        enhanceHarmonics();
                      }
                    }}
                    onChange={(e) => {
                      const newStrength = parseFloat(e.target.value);
                      setHarmonicStrength(newStrength);
                      
                      // Always update preview immediately
                      updateVisualPreview(newStrength);
                    }}
                  />
                  <span>{harmonicStrength.toFixed(2)}</span>
                </label>

                <label htmlFor="gain">
                  Gain:
                  <input
                    id="gain"
                    type="range"
                    value={gain}
                    min="0"
                    max="2"
                    step="0.01"
                    onChange={(e) => {
                      const newGain = parseFloat(e.target.value);
                      setGain(newGain);
                    }}
                  />
                  <span>{gain.toFixed(2)}</span>
                </label>
              </div>
            </div>
          </>
        )}
      </div>
      
      <div className="spectral-effects">
        <h2>Chaos Wavefolder</h2>
        <div className="control-row">
          {renderChaosControls()}
        </div>
      </div>
    </div>
  );
};

export default WavetableEditor;
