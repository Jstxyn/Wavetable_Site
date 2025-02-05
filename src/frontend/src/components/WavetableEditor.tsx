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
  const [equation, setEquation] = useState<string>('sin(t) * (1-frame) + ((2 * t - 1) * frame)');
  const [numFrames, setNumFrames] = useState<number>(256);
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [harmonicStrength, setHarmonicStrength] = useState<number>(0);
  const [gain, setGain] = useState<number>(1.0);
  const [isDraggingFormant, setIsDraggingFormant] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const harmonicTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastEnhanceTime = useRef<number>(0);
  const originalWaveformRef = useRef<WaveformData | null>(null);

  // Store original waveform when it's first generated
  useEffect(() => {
    if (waveformData && (!originalWaveformRef.current || equation !== originalWaveformRef.current.equation)) {
      originalWaveformRef.current = {
        frames: [...waveformData.frames],
        waveform: [...waveformData.waveform],
        equation: equation // Store the equation that generated this waveform
      };
    }
  }, [waveformData, equation]);

  // Simple preview of formant effect for immediate visual feedback
  const previewFormantEffect = (frame: number[], strength: number) => {
    return frame.map(y => {
      // Quick approximation of formant effect for preview
      const effect = 1 + (strength * Math.sign(y) * Math.abs(y));
      return y * effect;
    });
  };

  const updateVisualPreview = (strength: number) => {
    if (!waveformData || !originalWaveformRef.current) return;

    // Apply quick preview effect to first frame for 2D view
    const previewFrame = previewFormantEffect(originalWaveformRef.current.waveform, strength);
    
    // Update canvas with preview
    if (canvasRef.current) {
      drawWaveform(canvasRef.current, previewFrame);
    }

    // Create preview frames for 3D view
    const previewFrames = originalWaveformRef.current.frames.map(frame => 
      previewFormantEffect(frame, strength)
    );

    setWaveformData({
      frames: previewFrames,
      waveform: previewFrame
    });
  };

  const generateWaveform = async () => {
    try {
      setError(null);
      setActivePreset(null); // Clear active preset when generating from equation
      
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
      
      setWaveformData(data);
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
    if (now - lastEnhanceTime.current < 100) return;
    lastEnhanceTime.current = now;

    try {
      const response = await fetch('http://localhost:8081/api/waveform/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frames: originalWaveformRef.current.frames,
          strength: harmonicStrength
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to enhance harmonics');
      }

      const enhancedData = await response.json();
      setWaveformData({
        frames: enhancedData.frames,
        waveform: enhancedData.frames[0]
      });

      if (canvasRef.current) {
        drawWaveform(canvasRef.current, enhancedData.frames[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while enhancing harmonics');
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

  const handleBasicWaveform = async (type: string) => {
    try {
      // Update both preset and equation
      setActivePreset(type);
      switch(type) {
        case 'sine':
          setEquation('sin(t)');
          break;
        case 'square':
          setEquation('sign(sin(t))');
          break;
        case 'sawtooth':
          setEquation('2 * (t - 0.5)');
          break;
        case 'triangle':
          setEquation('2 * abs(2 * (t - 0.5)) - 1');
          break;
      }

      const response = await fetch(`http://localhost:8081/api/waveform/basic?type=${type}&frames=${numFrames}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate basic waveform');
      }

      const data: WaveformData = await response.json();
      setWaveformData(data);
      setError(null);

      if (canvasRef.current) {
        drawWaveform(canvasRef.current, data.waveform);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
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

  // Remove the auto-generate effect
  useEffect(() => {
    // Generate initial waveform
    generateWaveform();
  }, []); // Only run once on mount

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
                      enhanceHarmonics();
                    }}
                    onChange={(e) => {
                      const newStrength = parseFloat(e.target.value);
                      setHarmonicStrength(newStrength);
                      
                      // Immediate visual preview
                      updateVisualPreview(newStrength);
                      
                      // Debounced actual processing
                      if (harmonicTimeoutRef.current) {
                        clearTimeout(harmonicTimeoutRef.current);
                      }
                      harmonicTimeoutRef.current = setTimeout(() => {
                        if (!isDraggingFormant) {
                          enhanceHarmonics();
                        }
                      }, 100);
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
    </div>
  );
};

export default WavetableEditor;
