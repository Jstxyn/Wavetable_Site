/**
 * File: ThreeDView.tsx
 * Purpose: Renders a 3D visualization of a wavetable using Three.js
 * Date: 2025-02-11
 */

import React, { useRef, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { VISUAL_SCALE, WAVEFORM_COLOR } from '../constants/waveform';

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
  const meshRef = useRef<THREE.LineSegments>(null);
  const { gl } = useThree();

  // Generate the geometry for the waveform visualization
  const geometry = useMemo(() => {
    if (!frames?.length) return new THREE.BufferGeometry();

    try {
      const geometry = new THREE.BufferGeometry();
      const numFrames = frames.length;
      const frameSize = frames[0]?.length || 0;
      
      const vertices: number[] = [];
      const color = new THREE.Color(WAVEFORM_COLOR);
      
      // Create line segments for each frame
      for (let i = 0; i < numFrames; i++) {
        const frame = frames[i];
        const z = (i / numFrames) * 2 - 1;
        
        for (let j = 0; j < frameSize - 1; j++) {
          const x1 = (j / frameSize) * 2 - 1;
          const x2 = ((j + 1) / frameSize) * 2 - 1;
          const y1 = Math.max(-1, Math.min(1, frame[j] * gain)) * VISUAL_SCALE;
          const y2 = Math.max(-1, Math.min(1, frame[j + 1] * gain)) * VISUAL_SCALE;
          
          vertices.push(x1, y1, z);
          vertices.push(x2, y2, z);
        }
      }
      
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      return geometry;
    } catch (error) {
      console.error('Error generating 3D geometry:', error);
      return new THREE.BufferGeometry();
    }
  }, [frames, gain]);

  const material = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: WAVEFORM_COLOR,
      linewidth: 1
    });
  }, []);

  // Handle WebGL context loss
  React.useEffect(() => {
    const handleContextLost = () => {
      console.warn('WebGL context lost. You should probably reload the page');
    };

    gl.domElement.addEventListener('webglcontextlost', handleContextLost);
    return () => {
      gl.domElement.removeEventListener('webglcontextlost', handleContextLost);
    };
  }, [gl]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[2, 2, 2]} />
      
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      
      <group rotation={[0, Math.PI / 4, 0]}>
        <lineSegments ref={meshRef} geometry={geometry} material={material} />
      </group>
    </>
  );
};

export default ThreeDView;
