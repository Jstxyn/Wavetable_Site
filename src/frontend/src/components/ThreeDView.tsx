import React, { useRef, useMemo } from 'react';
import { extend, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

// Extend OrbitControls to make it available as a JSX element
extend({ OrbitControls });

interface ThreeDViewProps {
  frames: number[][]; // Array of frames, each frame is an array of samples
  gain: number;      // Amplitude multiplier for the waveform
}

/**
 * ThreeDView Component
 * Renders a 3D visualization of a wavetable where:
 * - X axis represents frame position (time)
 * - Y axis represents amplitude
 * - Z axis represents sample position within each frame
 */
const ThreeDView: React.FC<ThreeDViewProps> = ({ frames, gain }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const controlsRef = useRef<any>(null);

  // Calculate all vertex points for the waveform
  const points = useMemo(() => {
    if (!frames || frames.length === 0) return [];

    const frameCount = frames.length;           // Number of frames in the wavetable
    const samplesPerFrame = frames[0].length;   // Number of samples in each frame
    const vertices: THREE.Vector3[] = [];

    // Create points for each sample in each frame
    for (let i = 0; i < frameCount; i++) {
      const frame = frames[i];
      // X position is normalized between -1 and 1 across all frames
      const x = (i / frameCount) * 2 - 1;

      for (let j = 0; j < samplesPerFrame; j++) {
        // Y position is the amplitude value multiplied by gain
        const y = frame[j] * gain;
        // Z position is normalized between -1 and 1 across all samples in a frame
        const z = (j / samplesPerFrame) * 2 - 1;
        vertices.push(new THREE.Vector3(x, y, z));
      }
    }

    return vertices;
  }, [frames, gain]);

  // Create the line geometry that forms the grid-like structure
  const lineGeometry = useMemo(() => {
    if (points.length === 0) return null;

    const frameCount = frames.length;
    const samplesPerFrame = frames[0].length;
    const lines: THREE.Vector3[][] = [];

    // HORIZONTAL LINES: These create the waveform shape within each frame
    // These lines go along the Z axis (left to right in the view)
    for (let i = 0; i < frameCount; i++) {
      const framePoints: THREE.Vector3[] = [];
      for (let j = 0; j < samplesPerFrame; j++) {
        // Get point at current frame (i) and sample position (j)
        framePoints.push(points[i * samplesPerFrame + j]);
      }
      lines.push(framePoints);
    }

    // We've removed the vertical connecting lines to eliminate the grid effect
    return lines;
  }, [points, frames]);

  // Update controls on each frame
  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return (
    <>
      {/* Set up the camera and controls */}
      <PerspectiveCamera makeDefault position={[0, 2, 4]} />
      <OrbitControls 
        ref={controlsRef} 
        enableDamping 
        dampingFactor={0.1} 
      />
      
      {/* Add lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      {/* Render all lines */}
      {lineGeometry && lineGeometry.map((line, index) => (
        <Line
          key={index}
          points={line}
          color="#ff4444"
          lineWidth={1}
          dashed={false}
        />
      ))}
    </>
  );
};

export default ThreeDView;
