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

    // Sample every tenth frame for significantly reduced density
    for (let i = 0; i < frameCount; i += 10) {
      const framePoints: THREE.Vector3[] = [];
      // Sample every tenth point within each frame
      for (let j = 0; j < samplesPerFrame; j += 10) {
        framePoints.push(points[i * samplesPerFrame + j]);
      }
      lines.push(framePoints);
    }

    return lines;
  }, [points, frames]);

  // Custom shader material for the glowing effect
  const glowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color("#ff4444") },
        glowColor: { value: new THREE.Color("#ff8888") },
        glowIntensity: { value: 2.2 } // Increased glow intensity for better visibility with fewer lines
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform vec3 glowColor;
        uniform float glowIntensity;
        varying vec3 vPosition;
        
        void main() {
          float glow = length(vPosition) * glowIntensity;
          vec3 finalColor = mix(color, glowColor, glow);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      transparent: true,
    });
  }, []);

  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 2, 4]} />
      <OrbitControls 
        ref={controlsRef} 
        enableDamping 
        dampingFactor={0.1} 
      />
      
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      {lineGeometry && lineGeometry.map((line, index) => (
        <Line
          key={index}
          points={line}
          color="#ff4444"
          lineWidth={5}  // Increased line width to make fewer lines more visible
          dashed={false}
          material={glowMaterial}
        />
      ))}
    </>
  );
};

export default ThreeDView;
