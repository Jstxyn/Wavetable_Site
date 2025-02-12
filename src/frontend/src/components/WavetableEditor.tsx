import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { EffectManager } from '../effects/EffectManager';
import { EffectControls } from './EffectControls';
import ThreeDView from './ThreeDView';
import { API_BASE } from '../config';
import { VISUAL_SCALE, WAVEFORM_COLOR, DEFAULT_FRAME_COUNT } from '../constants/waveform';
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
    
    const vertices: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color(WAVEFORM_COLOR);
    
    // Visual scale factor (38% of original)
    const visualScale = VISUAL_SCALE;
    
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
    <lineSegments ref={meshRef}>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial attach="material" vertexColors={true} />
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
  const [is3D, setIs3D] = useState<boolean>(false);
  const [isEffectProcessing, setIsEffectProcessing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const effectManager = useRef(new EffectManager()).current;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const fetchWithCredentials = async (url: string, options: RequestInit = {}) => {
    const defaultOptions: RequestInit = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      ...options
    };

    const response = await fetch(url, defaultOptions);
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response;
  };

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

      if (canvasRef.current) {
        const scaledWaveform = data.waveform.map(v => v * gain);
        drawWaveform(canvasRef.current, scaledWaveform);
      }
    } catch (err) {
      console.error('Error generating waveform:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate waveform');
    }
  };

  const handleBasicWaveform = async (type: string) => {
    try {
      setError('');
      setActivePreset(type);
      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/basic?type=${type}&frames=256`);
      const data = await response.json();
      
      setWaveformData(data);
      setFrames(data.frames);

      if (canvasRef.current) {
        const scaledWaveform = data.waveform.map(v => v * gain);
        drawWaveform(canvasRef.current, scaledWaveform);
      }
    } catch (err) {
      console.error('Error generating waveform:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate waveform');
    }
  };

  const drawWaveform = useCallback((canvas: HTMLCanvasElement, waveform: number[]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !waveform.length) {
      console.warn('Failed to get 2D context or waveform is empty');
      return;
    }

    try {
      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Set up drawing style
      ctx.strokeStyle = WAVEFORM_COLOR;
      ctx.lineWidth = 1;

      // Draw the waveform
      ctx.beginPath();
      const stepX = canvas.width / waveform.length;
      const centerY = canvas.height / 2;
      
      // Use the same visual scale as 3D view
      const scaleY = centerY * VISUAL_SCALE;

      waveform.forEach((value, index) => {
        const x = index * stepX;
        const boundedValue = boundValue(value);
        const y = centerY + boundedValue * scaleY;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    } catch (error) {
      console.error('Error drawing waveform:', error);
    }
  }, []);

  const handleEffectChange = async () => {
    if (!waveformData) return;

    try {
      setIsEffectProcessing(true);
      const processedData = await effectManager.applyEffects(waveformData.waveform);

      // Create frames array from processed data
      const newFrames = Array(DEFAULT_FRAME_COUNT).fill(null).map((_, i) => {
        // Create variations of the waveform for each frame
        const frameOffset = (i / DEFAULT_FRAME_COUNT) * Math.PI;
        return processedData.map((sample, j) => {
          const phase = (j / processedData.length) * 2 * Math.PI;
          return boundValue(sample * Math.cos(phase + frameOffset));
        });
      });

      setWaveformData(prev => ({
        ...prev!,
        waveform: processedData,
        frames: newFrames
      }));

      setFrames(newFrames);

      if (canvasRef.current) {
        const scaledWaveform = processedData.map(v => boundValue(v * gain));
        drawWaveform(canvasRef.current, scaledWaveform);
      }
    } catch (error) {
      console.error('Failed to apply effect:', error);
      setError(error instanceof Error ? error.message : 'Failed to apply effect');
    } finally {
      setIsEffectProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!waveformData) return;
    
    try {
      setIsProcessing(true);
      const response = await fetchWithCredentials(
        `${API_BASE}/api/waveform/download`,
        {
          method: 'POST',
          body: JSON.stringify({
            frames: waveformData.frames,
            sample_rate: 44100,
            gain: gain
          }),
        }
      );
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wavetable.wav';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setError('');
    } catch (err) {
      console.error('Error downloading wavetable:', err);
      setError(err instanceof Error ? err.message : 'Failed to download wavetable');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0]; // Take only the first file
      if (file.type.startsWith('image/')) {
        setSelectedFileName(file.name);
        handleImageUpload(file);
      } else {
        setError('Please upload an image file');
      }
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setError('');
      setIsProcessing(true);
      
      // Convert the file to base64
      const reader = new FileReader();
      
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetchWithCredentials(`${API_BASE}/api/waveform/image`, {
        method: 'POST',
        body: JSON.stringify({ image: imageData }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setWaveformData(data);
      setFrames(data.frames);

      if (canvasRef.current) {
        const scaledWaveform = data.waveform.map(v => v * gain);
        drawWaveform(canvasRef.current, scaledWaveform);
      }
      
      // Store original waveform for effects
      originalWaveformRef.current = {
        ...data,
        frames: data.frames.map(frame => [...frame]),
        waveform: [...data.waveform],
        type: 'image'
      };
      
    } catch (err) {
      console.error('Error uploading image:', err);
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  };

  // Redraw waveform when toggling views or when gain changes
  useEffect(() => {
    if (!is3D && canvasRef.current && waveformData) {
      const scaledWaveform = waveformData.waveform.map(v => v * gain);
      drawWaveform(canvasRef.current, scaledWaveform);
    }
  }, [is3D, gain, waveformData]);

  // Generate initial waveform on mount
  useEffect(() => {
    handleBasicWaveform('sine');
  }, []);

  return (
    <div className="wavetable-editor">
      <div className="editor-header">
        <h2>Wavetable Editor</h2>
        <p className="editor-description">
          Create and modify wavetables using equations, basic waveforms, or image import
        </p>
      </div>

      <div className="input-section">
        <div className="equation-input">
          <label title="Enter a mathematical equation using 't' as the variable">
            Equation:
            <div className="equation-row">
              <input
                type="text"
                value={equation}
                onChange={(e) => setEquation(e.target.value)}
                placeholder="e.g., sin(2 * pi * t)"
              />
              <button
                className="generate-btn"
                onClick={generateWaveform}
                disabled={isProcessing}
              >
                Generate
              </button>
            </div>
          </label>
        </div>
        
        <div className="image-input">
          <label title="Import an image to create a wavetable from its brightness values">
            Image Import:
            <div 
              className={`compact-drop-zone ${isProcessing ? 'loading' : ''} ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  fileInputRef.current?.click();
                }
              }}
            >
              <div className="compact-drop-content">
                {isProcessing ? (
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
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setSelectedFileName(file.name);
                handleImageUpload(file);
              }
            }}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <div className="control-section">
        <div className="control-buttons">
          <div className="preset-buttons" role="group" aria-label="Basic waveform presets">
            {[
              { id: 'sine', label: 'Sine' },
              { id: 'square', label: 'Square' },
              { id: 'sawtooth', label: 'Sawtooth' },
              { id: 'triangle', label: 'Triangle' }
            ].map(preset => (
              <button
                key={preset.id}
                className={`preset-btn ${activePreset === preset.id ? 'active' : ''}`}
                onClick={() => handleBasicWaveform(preset.id)}
                title={`Generate ${preset.label.toLowerCase()} waveform`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="view-controls">
            <div className="view-toggle">
              <button
                className={`toggle-button ${!is3D ? 'active' : ''}`}
                onClick={() => setIs3D(false)}
              >
                2D View
              </button>
              <button
                className={`toggle-button ${is3D ? 'active' : ''}`}
                onClick={() => setIs3D(true)}
              >
                3D View
              </button>
            </div>
            
            <div className="gain-control">
              <div className="gain-divider"></div>
              <label title="Adjust the amplitude of the waveform">
                Gain:
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.01"
                  value={gain}
                  onChange={(e) => setGain(parseFloat(e.target.value))}
                />
                <span className="gain-value">{gain.toFixed(2)}</span>
              </label>
            </div>
          </div>

          <button
            className="download-btn"
            onClick={handleDownload}
            disabled={!waveformData || isProcessing}
            title="Download wavetable as WAV file"
          >
            {isProcessing ? 'Processing...' : 'Download Wavetable'}
          </button>
        </div>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="visualization-section">
        <div className="visualization">
          {is3D ? (
            <div className="three-d-view">
              <Canvas
                camera={{ position: [2, 2, 2], fov: 75 }}
                style={{ width: '100%', height: '400px' }}
              >
                <ThreeDView frames={frames} gain={gain} />
                <OrbitControls
                  enableDamping
                  dampingFactor={0.05}
                  rotateSpeed={0.5}
                  zoomSpeed={0.7}
                  minDistance={1}
                  maxDistance={10}
                />
              </Canvas>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="waveform-canvas"
              width={800}
              height={200}
            />
          )}
        </div>

        <div className="parameters-section">
          <EffectControls
            effectManager={effectManager}
            onEffectChange={handleEffectChange}
            isProcessing={isEffectProcessing}
          />
        </div>
      </div>
    </div>
  );
};

export default WavetableEditor;
