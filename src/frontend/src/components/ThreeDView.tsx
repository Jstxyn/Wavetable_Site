/**
 * File: ThreeDView.tsx
 * Purpose: Renders a 3D visualization of a wavetable using Three.js
 * Date: 2025-02-10
 */

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

    const frameCount = frames.length;
    const samplesPerFrame = frames[0].length;
    const vertices: THREE.Vector3[] = [];

    // Create points for each sample in each frame
    for (let i = 0; i < frameCount; i++) {
      const frame = frames[i];
      const x = (i / frameCount) * 2 - 1;

      for (let j = 0; j < samplesPerFrame; j++) {
        const y = frame[j] * gain;
        const z = (j / samplesPerFrame) * 2 - 1;
        vertices.push(new THREE.Vector3(x, y, z));
      }
    }

    return vertices;
  }, [frames, gain]);

  // Create the line geometry that forms the waveform
  const lineGeometry = useMemo(() => {
    if (points.length === 0) return null;

    const frameCount = frames.length;
    const samplesPerFrame = frames[0].length;
    const lines: THREE.Vector3[][] = [];

    // Sample frames adaptively based on frame count
    const frameStep = Math.max(1, Math.floor(frameCount / 32));
    const sampleStep = Math.max(1, Math.floor(samplesPerFrame / 64));

    for (let i = 0; i < frameCount; i += frameStep) {
      const framePoints: THREE.Vector3[] = [];
      for (let j = 0; j < samplesPerFrame; j += sampleStep) {
        framePoints.push(points[i * samplesPerFrame + j]);
      }
      lines.push(framePoints);

      // Add cross-frame connections every N frames
      if (i > 0 && i < frameCount - frameStep) {
        const crossPoints: THREE.Vector3[] = [];
        for (let j = 0; j < samplesPerFrame; j += sampleStep * 4) {
          crossPoints.push(
            points[i * samplesPerFrame + j],
            points[(i + frameStep) * samplesPerFrame + j]
          );
        }
        lines.push(crossPoints);
      }
    }

    return lines;
  }, [points, frames]);

  // Custom shader material for the glowing effect
  const glowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color("#ff4444") },
        glowColor: { value: new THREE.Color("#ff8888") },
        glowIntensity: { value: 1.8 }
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform vec3 glowColor;
        uniform float glowIntensity;
        varying vec3 vPosition;
        varying vec3 vNormal;
        
        void main() {
          float glow = length(vPosition) * glowIntensity;
          vec3 finalColor = mix(color, glowColor, glow);
          
          // Add edge highlighting
          float edgeFactor = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
          finalColor = mix(finalColor, glowColor, edgeFactor * 0.5);
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }, []);

  // Smooth camera controls
  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[2, 2, 2]} />
      <OrbitControls 
        ref={controlsRef} 
        enableDamping 
        dampingFactor={0.05}
        rotateSpeed={0.5}
        zoomSpeed={0.7}
        minDistance={1}
        maxDistance={10}
      />
      
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      
      <group rotation={[0, Math.PI / 4, 0]}>
        {lineGeometry && lineGeometry.map((line, index) => (
          <Line
            key={index}
            points={line}
            color="#ff4444"
            lineWidth={3}
            dashed={false}
            material={glowMaterial}
          />
        ))}
      </group>
    </>
  );
};

export default ThreeDView;
