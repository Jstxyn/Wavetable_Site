import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
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
    const color = new THREE.Color('#ff4d4d');
    
    // Visual scale factor (48% of original)
    const visualScale = 0.38;
    
    // Create line segments for each frame
    for (let i = 0; i < numFrames; i++) {
      const frame = frames[i];
      const z = (i / numFrames) * 2 - 1;
      
      for (let j = 0; j < frameSize - 1; j++) {
        const x1 = (j / frameSize) * 2 - 1;
        const x2 = ((j + 1) / frameSize) * 2 - 1;
        const y1 = boundValue(frame[j] * gain) * visualScale;
        const y2 = boundValue(frame[j + 1] * gain) * visualScale;
        
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
      <lineBasicMaterial color="#ff4d4d" transparent opacity={0.8} linewidth={2} />
    </lineSegments>
  );
};

const WavetableEditor: React.FC = () => {
  const [equation, setEquation] = useState<string>('sin(t)');
  const [frames, setFrames] = useState<number[][]>([]);
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [showImageOptions, setShowImageOptions] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<string>('');
  const [gain, setGain] = useState<number>(1.0);
  const [isChaosEnabled, setIsChaosEnabled] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [chaosParams, setChaosParams] = useState({
    sigma: 5,
    rho: 14,
    beta: 1.33,
    dt: 0.005
  });
  const [debouncedParams, setDebouncedParams] = useState(chaosParams);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [is3D, setIs3D] = useState<boolean>(false);
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

  // Add back chaos folder functionality
  const applyChaosFolder = async () => {
    if (!waveformData || !originalWaveformRef.current) {
      setError('No waveform data available');
      return;
    }

    try {
      setError('');
      setIsProcessing(true);
      
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

      data.frames = data.frames.map(frame => frame.map(v => boundValue(v)));
      data.waveform = data.waveform.map(v => boundValue(v));

      setWaveformData({
        ...data,
        type: waveformData.type || 'custom',
        equation: waveformData.equation || ''
      });
      setFrames(data.frames);

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

  const ThreeDView: React.FC<{ frames: number[][], gain: number }> = useCallback(({ frames, gain }) => {
    return (
      <div className="canvas-container" style={{ width: '100%', height: '400px' }}>
        <Canvas camera={{ position: [2, 2, 2], fov: 60, near: 0.1, far: 1000 }}>
          <color attach="background" args={['#1a1a1a']} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          <WaveformMesh frames={frames} gain={gain} />
          <OrbitControls enableDamping={true} dampingFactor={0.05} rotateSpeed={0.5} />
          <gridHelper args={[2, 20, '#404040', '#303030']} />
          <axesHelper args={[1]} />
        </Canvas>
      </div>
    );
  }, []);

  const generateWaveform = async () => {
    try {
      setError('');
      setActivePreset('');

      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/equation`, {
        method: 'POST',
        body: JSON.stringify({
          equation,
          frames: 256
        }),
      });

      const data = await response.json();
      
      setWaveformData(data);
      setFrames(data.frames);
    } catch (err) {
      console.error('Error generating waveform:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate waveform');
    }
  };

  const handleBasicWaveform = async (type: string) => {
    try {
      setError('');
      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/basic?type=${type}&frames=256`);
      const data = await response.json();
      setWaveformData(data);
      setFrames(data.frames);
    } catch (err) {
      console.error('Error generating waveform:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate waveform');
    }
  };

  const drawWaveform = useCallback((canvas: HTMLCanvasElement, waveform: number[]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !waveform.length) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set up drawing style
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;

    // Draw the waveform
    ctx.beginPath();
    const stepX = canvas.width / waveform.length;
    const centerY = canvas.height / 2;
    const scaleY = canvas.height / 2;

    waveform.forEach((value, index) => {
      const x = index * stepX;
      const y = centerY + value * scaleY;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }, []);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setError('');

    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) {
      setError('Please drop an image file');
      return;
    }

    processImageFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const processImageFile = async (file: File) => {
    try {
      setLoading(true);
      setError('');
      setSelectedFileName(file.name);

      // Create a new FileReader
      const reader = new FileReader();

      // Set up the FileReader onload handler
      reader.onload = async (event) => {
        if (!event.target?.result) {
          throw new Error('Failed to read file');
        }

        try {
          // Send the image data to the server
          const response = await fetch('http://localhost:8081/api/waveform/image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image: event.target.result,
              combineWithEquation: false,
              currentFrames: waveformData?.frames
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${errorText}`);
          }

          const data = await response.json();
          if (data.error) {
            throw new Error(data.error);
          }

          // Update the waveform data
          setWaveformData(data);
          setFrames(data.frames);

          // Don't clear the equation when importing an image
          setActivePreset('');
          setShowImageOptions(false);

          // Force a redraw of the waveform
          if (canvasRef.current) {
            requestAnimationFrame(() => {
              drawWaveform(canvasRef.current, data.waveform);
            });
          }
        } catch (err) {
          console.error('Server processing error:', err);
          setError(err instanceof Error ? err.message : 'Failed to process image');
          setLoading(false);
        }
      };

      // Set up error handler
      reader.onerror = () => {
        setError('Failed to read file');
        setLoading(false);
      };

      // Read the file
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File processing error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process file');
      setLoading(false);
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
        
        <div className="input-group image-input">
          <label>Image Import:</label>
          <div 
            className={`compact-drop-zone ${loading ? 'loading' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="compact-drop-content">
              {loading ? (
                <span>Processing image...</span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15V16.2C21 17.8802 21 18.7202 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.7202 21 17.8802 21 16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>{selectedFileName || 'Click or drop image'}</span>
                </>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
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

      {showImageOptions && (
        <div className="image-options">
          <button 
            onClick={() => handleImageImport(false)}
            className="option-btn"
          >
            Overwrite Current
          </button>
          <button 
            onClick={() => handleImageImport(true)}
            className="option-btn"
          >
            Combine with Current
          </button>
        </div>
      )}
      
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
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="visualization">
        <div className="view-controls">
          <button
            onClick={() => setIs3D(false)}
            className={!is3D ? 'active' : ''}
          >
            2D View
          </button>
          <button
            onClick={() => setIs3D(true)}
            className={is3D ? 'active' : ''}
          >
            3D View
          </button>
        </div>

        {waveformData && waveformData.frames && waveformData.frames.length > 0 && (
          <>
            <div className="waveform-view">
              {!is3D ? (
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
            <div className="spectral-effects">
              <h2>Chaos Wavefolder</h2>
              <div className="control-row">
                {renderChaosControls()}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WavetableEditor;
