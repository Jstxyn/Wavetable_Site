import React, { useEffect, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import styled from 'styled-components';
import axios from 'axios';
import * as THREE from 'three';

const VisualizerContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  padding: 20px;
`;

const CanvasContainer = styled.div`
  width: 100%;
  height: 400px;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
`;

const ControlsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FrameControls = styled.div`
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
`;

const HarmonicSlider = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  
  input[type="range"] {
    width: 200px;
  }
  
  label {
    color: #fff;
    min-width: 150px;
  }
`;

const Button = styled.button`
  padding: 8px 16px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  
  &:hover {
    background: #45a049;
  }
  
  &:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }
`;

const FrameList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
`;

const Frame = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #2a2a2a;
  border-radius: 4px;
`;

const FrameGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
  margin-top: 20px;
  padding: 20px;
  background: #2a2a2a;
  border-radius: 8px;
`;

const FramePreview = styled.div<{ selected?: boolean }>`
  aspect-ratio: 1;
  background: ${props => props.selected ? '#4CAF50' : '#1a1a1a'};
  border: 2px solid ${props => props.selected ? '#45a049' : '#333'};
  border-radius: 4px;
  padding: 10px;
  cursor: pointer;
  position: relative;
  
  &:hover {
    border-color: #4CAF50;
  }
  
  canvas {
    width: 100%;
    height: 100%;
  }
  
  .frame-number {
    position: absolute;
    top: 5px;
    left: 5px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
  }
`;

interface WaveformData {
  waveform: number[];
  spectrum: number[];
  type: string;
  samples: number;
  harmonics: number;
}

interface FrameData {
  type: string;
  harmonics: number;
  morph: boolean;
}

interface WaveformMeshProps {
  frames: FrameData[];
  color?: string;
  position?: [number, number, number];
  scale?: [number, number, number];
}

interface SpectrumMeshProps {
  data: number[];
  color?: string;
  position?: [number, number, number];
  scale?: [number, number, number];
}

interface Props {
  waveformType: string;
}

interface FramePreviewProps {
  frame: FrameData;
  index: number;
  selected: boolean;
  onClick: () => void;
}

const WaveformMesh = ({ frames, color = '#00ff00', position = [0, 0, 0], scale = [1, 1, 1] }: WaveformMeshProps) => {
  const [waveformData, setWaveformData] = useState<number[][]>([]);
  const TOTAL_FRAMES = 256; // Total number of frames in wavetable

  useEffect(() => {
    const fetchWaveforms = async () => {
      try {
        const responses = await Promise.all(frames.map(frame =>
          axios.get<WaveformData>(
            `http://localhost:8081/api/waveform/basic?type=${frame.type}&harmonics=${frame.harmonics}`,
            {
              withCredentials: true,
              headers: {
                'Content-Type': 'application/json'
              }
            }
          )
        ));

        // Extract waveforms
        const baseWaveforms = responses.map(r => r.data.waveform);
        
        // If only one frame, repeat it for all 256 frames
        if (baseWaveforms.length === 1) {
          const repeatedFrames = Array(TOTAL_FRAMES).fill(baseWaveforms[0]);
          setWaveformData(repeatedFrames);
          return;
        }

        // For multiple frames, generate all 256 frames by interpolating
        const allWaveforms: number[][] = [];
        const segmentLength = Math.floor(TOTAL_FRAMES / (baseWaveforms.length - 1));
        
        for (let i = 0; i < baseWaveforms.length - 1; i++) {
          const current = baseWaveforms[i];
          const next = baseWaveforms[i + 1];
          const isLastSegment = i === baseWaveforms.length - 2;
          
          // Calculate how many frames for this segment
          const framesInThisSegment = isLastSegment 
            ? TOTAL_FRAMES - (i * segmentLength) // Use remaining frames for last segment
            : segmentLength;
          
          // Generate frames for this segment
          for (let f = 0; f < framesInThisSegment; f++) {
            const t = f / framesInThisSegment;
            const morphed = current.map((val, idx) => 
              val * (1 - t) + next[idx] * t
            );
            allWaveforms.push(morphed);
          }
        }
        
        setWaveformData(allWaveforms);
      } catch (error) {
        console.error('Error fetching waveforms:', error);
      }
    };

    fetchWaveforms();
  }, [frames]);

  // Early return if no data
  if (waveformData.length === 0) return null;

  const points: number[] = [];
  const indices: number[] = [];
  const verticesPerFrame = waveformData[0].length;
  const zSpacing = 0.01; // Much closer spacing between frames

  // Generate points for each frame
  waveformData.forEach((frame, frameIndex) => {
    const zOffset = (frameIndex - (waveformData.length - 1) / 2) * zSpacing;
    frame.forEach((y, i) => {
      const x = (i / (frame.length - 1) - 0.5) * 2;
      points.push(
        x * scale[0],
        y * scale[1],
        zOffset * scale[2]
      );
    });
  });

  // Generate line indices - only connect points within each frame
  for (let f = 0; f < waveformData.length; f++) {
    const baseIndex = f * verticesPerFrame;
    for (let i = 0; i < verticesPerFrame - 1; i++) {
      indices.push(baseIndex + i, baseIndex + i + 1);
    }
  }

  return (
    <group position={[position[0], position[1], position[2]]}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length / 3}
            array={new Float32Array(points)}
            itemSize={3}
            needsUpdate={true}
          />
          <bufferAttribute
            attach="index"
            count={indices.length}
            array={new Uint16Array(indices)}
            itemSize={1}
            needsUpdate={true}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} linewidth={1} />
      </lineSegments>
    </group>
  );
};

const SpectrumMesh = ({ data, color = '#ff0000', position = [0, 0, 0], scale = [1, 1, 1] }: SpectrumMeshProps) => {
  const points: number[] = [];
  const indices: number[] = [];
  
  const maxVal = Math.max(...data);
  const normalizedData = data.map(val => val / maxVal);
  
  for (let i = 0; i < normalizedData.length; i++) {
    const x = (i / (normalizedData.length - 1) - 0.5) * 2;
    points.push(x * scale[0], 0, 0);
    points.push(x * scale[0], normalizedData[i] * scale[1], 0);
    
    const baseIndex = i * 2;
    indices.push(baseIndex, baseIndex + 1);
  }

  return (
    <group position={[position[0], position[1], position[2]]}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length / 3}
            array={new Float32Array(points)}
            itemSize={3}
            needsUpdate={true}
          />
          <bufferAttribute
            attach="index"
            count={indices.length}
            array={new Uint16Array(indices)}
            itemSize={1}
            needsUpdate={true}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} linewidth={2} />
      </lineSegments>
    </group>
  );
};

const FramePreviewComponent: React.FC<FramePreviewProps> = ({ frame, index, selected, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewData, setPreviewData] = useState<number[] | null>(null);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const response = await axios.get<WaveformData>(
          `http://localhost:8081/api/waveform/basic?type=${frame.type}&harmonics=${frame.harmonics}`,
          {
            withCredentials: true,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
        setPreviewData(response.data.waveform);
      } catch (error) {
        console.error('Error fetching preview:', error);
      }
    };

    fetchPreview();
  }, [frame.type, frame.harmonics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw waveform preview
    ctx.strokeStyle = selected ? '#4CAF50' : '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    // Draw actual waveform data
    previewData.forEach((y, i) => {
      const x = (i / (previewData.length - 1)) * canvas.width;
      const scaledY = (canvas.height / 2) + y * (canvas.height / 3);
      if (i === 0) ctx.moveTo(x, scaledY);
      else ctx.lineTo(x, scaledY);
    });
    
    ctx.stroke();
  }, [selected, previewData]);

  return (
    <FramePreview selected={selected} onClick={onClick}>
      <canvas ref={canvasRef} width={100} height={100} />
      <div className="frame-number">Frame {index + 1}</div>
    </FramePreview>
  );
};

const WaveformVisualizer = ({ waveformType }: Props) => {
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<number>(-1);
  const [harmonics, setHarmonics] = useState(256);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const fetchWaveform = async () => {
      try {
        if (frames.length > 0 && selectedFrame >= 0) {
          const frame = frames[selectedFrame];
          const response = await axios.get<WaveformData>(
            `http://localhost:8081/api/waveform/basic?type=${frame.type}&harmonics=${frame.harmonics}`,
            {
              withCredentials: true,
              headers: {
                'Content-Type': 'application/json'
              }
            }
          );
          setWaveformData(response.data);
        } else {
          const response = await axios.get<WaveformData>(
            `http://localhost:8081/api/waveform/basic?type=${waveformType}&harmonics=${harmonics}`,
            {
              withCredentials: true,
              headers: {
                'Content-Type': 'application/json'
              }
            }
          );
          setWaveformData(response.data);
        }
        setKey(prev => prev + 1);
      } catch (error) {
        console.error('Error fetching waveform:', error);
      }
    };

    fetchWaveform();
  }, [waveformType, harmonics, selectedFrame, frames]);

  const handleAddFrame = () => {
    // Limit to 32 key frames - the backend will interpolate to 256
    if (frames.length < 32) {
      const newFrame = {
        type: waveformType,
        harmonics: harmonics,
        morph: true
      };
      setFrames([...frames, newFrame]);
      setSelectedFrame(frames.length); 
    }
  };

  const handleRemoveFrame = (index: number) => {
    setFrames(frames.filter((_, i) => i !== index));
    if (selectedFrame === index) {
      setSelectedFrame(-1); 
    } else if (selectedFrame > index) {
      setSelectedFrame(selectedFrame - 1); 
    }
  };

  const handleToggleMorph = (index: number) => {
    setFrames(frames.map((frame, i) => 
      i === index ? { ...frame, morph: !frame.morph } : frame
    ));
  };

  const handleExport = async () => {
    try {
      // Filter frames that have morph enabled
      const frameData = frames.filter(frame => frame.morph);
      
      if (frameData.length === 0) {
        alert('Please add at least one frame with morph enabled');
        return;
      }

      console.log('Exporting frames:', frameData);
      
      const response = await axios({
        method: 'post',
        url: 'http://localhost:8081/api/waveform/export',
        data: { frames: frameData },
        responseType: 'blob',
        headers: {
          'Content-Type': 'application/json'
        },
        withCredentials: true
      });
      
      console.log('Export response received:', response);
      
      // Create blob URL
      const blob = new Blob([response.data], { type: 'audio/wav' });
      const url = window.URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `wavetable_${frameData.map(f => f.type).join('_')}.wav`);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      link.remove();
      
    } catch (error) {
      console.error('Error exporting wavetable:', error);
      if (axios.isAxiosError(error)) {
        console.error('Response:', error.response);
        console.error('Request:', error.request);
        alert(`Failed to export wavetable: ${error.message}`);
      } else {
        alert('Failed to export wavetable. Check console for details.');
      }
    }
  };

  return (
    <VisualizerContainer>
      <ControlsContainer>
        <FrameControls>
          <HarmonicSlider>
            <label>Harmonics (1-256):</label>
            <input
              type="range"
              min="1"
              max="256"
              value={harmonics}
              onChange={(e) => setHarmonics(parseInt(e.target.value))}
            />
            <span>{harmonics}</span>
          </HarmonicSlider>
          
          <Button onClick={handleAddFrame} disabled={frames.length >= 32}>
            Add Frame
          </Button>
          
          <Button onClick={handleExport}>
            Export Wavetable
          </Button>
        </FrameControls>
        
        <FrameList>
          {frames.map((frame, index) => (
            <Frame key={index}>
              <span>Frame {index + 1}: {frame.type}</span>
              <label>
                <input
                  type="checkbox"
                  checked={frame.morph}
                  onChange={() => handleToggleMorph(index)}
                />
                Morph
              </label>
              <Button onClick={() => handleRemoveFrame(index)}>Remove</Button>
            </Frame>
          ))}
        </FrameList>
        
        <FrameGrid>
          {frames.map((frame, index) => (
            <FramePreviewComponent
              key={index}
              frame={frame}
              index={index}
              selected={selectedFrame === index}
              onClick={() => setSelectedFrame(index)}
            />
          ))}
        </FrameGrid>
      </ControlsContainer>
      
      <CanvasContainer>
        <Canvas camera={{ position: [2, 1, 2], fov: 60 }}>
          <color attach="background" args={['#1a1a1a']} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          <WaveformMesh
            key={`waveform-${key}`}
            frames={frames.length > 0 ? frames : [{
              type: waveformType,
              harmonics: harmonics,
              morph: true
            }]}
            scale={[2, 1, 2]}
            position={[0, 0, 0]}
            color="#4CAF50"
          />
          
          {waveformData && (
            <SpectrumMesh
              key={`spectrum-${key}`}
              data={waveformData.spectrum}
              scale={[2, 1, 0]}
              position={[0, -1.5, 0]}
              color="#ff00ff"
            />
          )}
          
          <OrbitControls 
            enableZoom={true} 
            enablePan={true} 
            enableRotate={true}
            target={[0, 0, 0]}
          />
        </Canvas>
      </CanvasContainer>
    </VisualizerContainer>
  );
};

export default WaveformVisualizer;
