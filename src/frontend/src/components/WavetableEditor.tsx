import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import './WavetableEditor.css';

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
    const geometry = new THREE.BufferGeometry();
    const numFrames = frames.length;
    const frameSize = frames[0].length;
    
    const vertices = [];
    const colors = [];
    const color = new THREE.Color('#ff4d4d');
    
    // Sample fewer frames for reduced line density
    const frameStep = 3; // Skip every 3rd frame
    const sampleStep = 3; // Skip every 3rd point in each frame
    
    for (let i = 0; i < numFrames; i += frameStep) {
      const frame = frames[i];
      const z = (i / (numFrames - 1)) * 2 - 1;
      
      // Create line segments with reduced density
      for (let j = 0; j < frameSize - sampleStep; j += sampleStep) {
        const x1 = (j / (frameSize - 1)) * 2 - 1;
        const x2 = ((j + sampleStep) / (frameSize - 1)) * 2 - 1;
        const y1 = frame[j] * gain;
        const y2 = frame[j + sampleStep] * gain;
        
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

  return (
    <lineSegments ref={meshRef} geometry={geometry}>
      <lineBasicMaterial color="#ff4d4d" transparent opacity={0.8} linewidth={3} />
    </lineSegments>
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
  const [chaosParams, setChaosParams] = useState({
    sigma: 10,
    rho: 28,
    beta: 2.667,
    dt: 0.01
  });
  const [isChaosEnabled, setIsChaosEnabled] = useState<boolean>(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const harmonicTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastEnhanceTime = useRef<number>(0);
  const originalWaveformRef = useRef<WaveformData | null>(null);

  // Store original waveform when it's first generated
  useEffect(() => {
    if (waveformData && (!originalWaveformRef.current || equation !== originalWaveformRef.current.equation)) {
      originalWaveformRef.current = {
        ...waveformData,
        frames: waveformData.frames.map(frame => [...frame]),
        waveform: [...waveformData.waveform],
        equation: equation,
        type: waveformData.type || 'custom'
      };
    }
  }, [waveformData, equation]);

  useEffect(() => {
    // Generate initial sine wave
    handleBasicWaveform('sine');
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

    // Get the original frames
    const originalFrames = originalWaveformRef.current.frames;
    const originalWaveform = originalWaveformRef.current.waveform;

    // Apply preview effect
    const previewFrame = previewFormantEffect(originalWaveform, strength);
    const previewFrames = originalFrames.map(frame => 
      previewFormantEffect(frame, strength)
    );

    // Update canvas with preview
    if (canvasRef.current) {
      drawWaveform(canvasRef.current, previewFrame);
    }

    // Update state while preserving all other properties
    setWaveformData(prev => ({
      ...prev,
      frames: previewFrames,
      waveform: previewFrame
    }));
  };

  const generateWaveform = async () => {
    try {
      setError(null);
      setActivePreset(null); // Clear active preset when generating custom equation
      
      const response = await fetch('http://localhost:8081/api/waveform/equation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          equation,
          frames: numFrames
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate waveform');
      }

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
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleBasicWaveform = async (type: string) => {
    try {
      setError(null);
      // Update both preset and equation
      setActivePreset(type);
      
      // Set the equation based on type
      const equations = {
        sine: 'sin(t)',
        square: 'sign(sin(t))',
        sawtooth: '2 * (t - 0.5)',
        triangle: '2 * abs(2 * (t - 0.5)) - 1'
      };
      const newEquation = equations[type];
      setEquation(newEquation);

      const response = await fetch(`http://localhost:8081/api/waveform/basic?type=${type}&frames=${numFrames}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate basic waveform');
      }

      const data: WaveformData = await response.json();
      // Reset harmonic strength when changing waveform
      setHarmonicStrength(0);
      
      // Store the original data with equation
      const newWaveformData = {
        ...data,
        type,
        equation: newEquation
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
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const enhanceHarmonics = async () => {
    if (!waveformData || !originalWaveformRef.current) return;

    const now = Date.now();
    if (now - lastEnhanceTime.current < 50) return;
    lastEnhanceTime.current = now;

    try {
      const response = await fetch('http://localhost:8081/api/waveform/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frames: originalWaveformRef.current.frames,
          strength: harmonicStrength,
          type: originalWaveformRef.current.type
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to enhance harmonics');
      }

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
      setError(err instanceof Error ? err.message : 'An error occurred while enhancing harmonics');
    }
  };

  const applyChaosFolder = async () => {
    if (!waveformData || !originalWaveformRef.current) return;

    try {
      const response = await fetch('http://localhost:8081/api/waveform/chaos_fold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frames: originalWaveformRef.current.frames,
          ...chaosParams
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to apply chaos folder');
      }

      const foldedData = await response.json();
      
      setWaveformData(prev => ({
        ...prev,
        frames: foldedData.frames,
        waveform: foldedData.frames[0],
        spectrum: foldedData.spectrum
      }));

      if (canvasRef.current) {
        drawWaveform(canvasRef.current, foldedData.frames[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while applying chaos folder');
    }
  };

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
      const scaledY = y * gain;
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
      const response = await fetch('http://localhost:8081/api/waveform/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frames: waveformData.frames,
          gain: gain
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download waveform');
      }

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
      setError(err instanceof Error ? err.message : 'An error occurred while downloading');
    }
  };

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

        {waveformData && waveformData.frames && (
          <>
            <div className="waveform-view">
              {viewMode === '2d' ? (
                <>
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                  />
                </>
              ) : (
                <div className="canvas-container">
                  <Canvas camera={{ position: [1, 1, 1], fov: 75 }}>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} />
                    <WaveformMesh frames={waveformData.frames} gain={gain} />
                    <OrbitControls />
                    <gridHelper args={[2, 20, '#404040', '#303030']} />
                  </Canvas>
                </div>
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
                    min="-1"
                    max="1"
                    step="0.01"
                    value={harmonicStrength}
                    onMouseDown={() => setIsDraggingFormant(true)}
                    onMouseUp={() => {
                      setIsDraggingFormant(false);
                      // Force an enhance after drag ends
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
                      
                      // Only do actual processing if we're not dragging
                      if (harmonicTimeoutRef.current) {
                        clearTimeout(harmonicTimeoutRef.current);
                      }
                      
                      if (!isDraggingFormant) {
                        harmonicTimeoutRef.current = setTimeout(() => {
                          enhanceHarmonics();
                        }, 50); 
                      }
                    }}
                  />
                  <span>{harmonicStrength.toFixed(2)}</span>
                </label>
                <label htmlFor="gain">
                  Gain:
                  <input
                    id="gain"
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={gain}
                    onChange={(e) => {
                      const newGain = parseFloat(e.target.value);
                      setGain(newGain);
                      if (canvasRef.current && waveformData) {
                        drawWaveform(canvasRef.current, waveformData.waveform);
                      }
                    }}
                  />
                  <span>{gain.toFixed(2)}</span>
                </label>
              </div>
            </div>
          </>
        )}
      </div>
      
      <div className="chaos-controls" style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
        <h3>Chaos Wavefolder</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
          <label>
            <input
              type="checkbox"
              checked={isChaosEnabled}
              onChange={(e) => setIsChaosEnabled(e.target.checked)}
            />
            Enable Chaos
          </label>
          {isChaosEnabled && (
            <button
              onClick={applyChaosFolder}
              className="generate-btn"
              type="button"
            >
              Apply Chaos Fold
            </button>
          )}
        </div>
        
        {isChaosEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            <div>
              <label htmlFor="sigma">Sigma:</label>
              <input
                id="sigma"
                type="range"
                min="1"
                max="50"
                step="0.1"
                value={chaosParams.sigma}
                onChange={(e) => setChaosParams(prev => ({ ...prev, sigma: parseFloat(e.target.value) }))}
              />
              <span>{chaosParams.sigma.toFixed(1)}</span>
            </div>
            <div>
              <label htmlFor="rho">Rho:</label>
              <input
                id="rho"
                type="range"
                min="1"
                max="100"
                step="0.1"
                value={chaosParams.rho}
                onChange={(e) => setChaosParams(prev => ({ ...prev, rho: parseFloat(e.target.value) }))}
              />
              <span>{chaosParams.rho.toFixed(1)}</span>
            </div>
            <div>
              <label htmlFor="beta">Beta:</label>
              <input
                id="beta"
                type="range"
                min="0.1"
                max="10"
                step="0.001"
                value={chaosParams.beta}
                onChange={(e) => setChaosParams(prev => ({ ...prev, beta: parseFloat(e.target.value) }))}
              />
              <span>{chaosParams.beta.toFixed(3)}</span>
            </div>
            <div>
              <label htmlFor="dt">Time Step:</label>
              <input
                id="dt"
                type="range"
                min="0.001"
                max="0.1"
                step="0.001"
                value={chaosParams.dt}
                onChange={(e) => setChaosParams(prev => ({ ...prev, dt: parseFloat(e.target.value) }))}
              />
              <span>{chaosParams.dt.toFixed(3)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WavetableEditor;
