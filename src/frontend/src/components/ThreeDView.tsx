import React, { useRef, useMemo } from 'react';
import { extend, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

extend({ OrbitControls });

interface ThreeDViewProps {
  frames: number[][];
  gain: number;
}

const ThreeDView: React.FC<ThreeDViewProps> = ({ frames, gain }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const controlsRef = useRef<any>(null);

  const points = useMemo(() => {
    if (!frames || frames.length === 0) return [];

    const frameCount = frames.length;
    const samplesPerFrame = frames[0].length;
    const vertices: THREE.Vector3[] = [];

    for (let i = 0; i < frameCount; i++) {
      const frame = frames[i];
      const x = (i / frameCount) * 2 - 1; // Normalize x position

      for (let j = 0; j < samplesPerFrame; j++) {
        const y = frame[j] * gain; // Apply gain to y value
        const z = (j / samplesPerFrame) * 2 - 1; // Normalize z position
        vertices.push(new THREE.Vector3(x, y, z));
      }
    }

    return vertices;
  }, [frames, gain]);

  const lineGeometry = useMemo(() => {
    if (points.length === 0) return null;

    const frameCount = frames.length;
    const samplesPerFrame = frames[0].length;
    const lines: THREE.Vector3[][] = [];

    // Create horizontal lines (waveform per frame)
    for (let i = 0; i < frameCount; i++) {
      const framePoints: THREE.Vector3[] = [];
      for (let j = 0; j < samplesPerFrame; j++) {
        framePoints.push(points[i * samplesPerFrame + j]);
      }
      lines.push(framePoints);
    }

    // Create vertical lines (connecting frames)
    for (let j = 0; j < samplesPerFrame; j++) {
      const verticalPoints: THREE.Vector3[] = [];
      for (let i = 0; i < frameCount; i++) {
        verticalPoints.push(points[i * samplesPerFrame + j]);
      }
      lines.push(verticalPoints);
    }

    return lines;
  }, [points, frames]);

  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 2, 4]} />
      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.1} />
      
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      {lineGeometry && lineGeometry.map((line, index) => (
        <Line
          key={index}
          points={line}
          color="#ff4444"
          lineWidth={1}
          dashed={false}
        />
      ))}

      <gridHelper args={[20, 20, '#666666', '#444444']} />
      <axesHelper args={[5]} />
    </>
  );
};

export default ThreeDView;
