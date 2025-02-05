import React, { useState, useEffect, useRef } from 'react';
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
}

const WaveformMesh: React.FC<{ frames: number[][] }> = ({ frames }) => {
  const meshRef = useRef<THREE.LineSegments>(null);
  
  useEffect(() => {
    if (!meshRef.current || !frames.length) return;
    
    const numFrames = frames.length;
    const frameSize = frames[0].length;
    
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const color = new THREE.Color('#ff4d4d');
    
    // Generate vertices for each frame as a continuous line
    for (let i = 0; i < numFrames; i++) {
      const frame = frames[i];
      const z = (i / (numFrames - 1)) * 2 - 1;
      
      // Create line segments for this frame
      for (let j = 0; j < frameSize - 1; j++) {
        const x1 = (j / (frameSize - 1)) * 2 - 1;
        const x2 = ((j + 1) / (frameSize - 1)) * 2 - 1;
        const y1 = frame[j];
        const y2 = frame[j + 1];
        
        vertices.push(x1, y1, z);
        vertices.push(x2, y2, z);
        
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    if (meshRef.current) {
      meshRef.current.geometry = geometry;
    }
  }, [frames]);
  
  return (
    <lineSegments ref={meshRef}>
      <lineBasicMaterial vertexColors transparent opacity={0.8} />
    </lineSegments>
  );
};

const WavetableEditor: React.FC = () => {
  const [equation, setEquation] = useState<string>('sin(t) * (1-frame) + ((2 * t - 1) * frame)');
  const [numFrames, setNumFrames] = useState<number>(256);
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawWaveform = (canvas: HTMLCanvasElement, data: number[]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !data.length) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    const scaleY = height / 2.5;

    ctx.clearRect(0, 0, width, height);
    
    // Draw center line
    ctx.beginPath();
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 2;

    data.forEach((y, i) => {
      const x = (i / data.length) * width;
      if (i === 0) {
        ctx.moveTo(x, centerY + y * scaleY);
      } else {
        ctx.lineTo(x, centerY + y * scaleY);
      }
    });

    ctx.stroke();
  };

  const generateWaveform = async () => {
    try {
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
          frames: waveformData.frames
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
        <div className="waveform-view">
          <h3>2D Waveform View</h3>
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
          />
        </div>

        {waveformData && waveformData.frames && (
          <div className="wavetable-3d-view">
            <h3>3D Wavetable View</h3>
            <div className="canvas-container">
              <Canvas camera={{ position: [1, 1, 1], fov: 75 }}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} />
                <WaveformMesh frames={waveformData.frames} />
                <OrbitControls />
                <gridHelper args={[2, 20, '#404040', '#303030']} />
              </Canvas>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WavetableEditor;
