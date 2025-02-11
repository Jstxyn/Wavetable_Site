/**
 * File: ThreeDView.tsx
 * Purpose: Renders a 3D visualization of a wavetable using Three.js
 * Date: 2025-02-11
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { extend, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import debounce from 'lodash/debounce';

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
  const { gl } = useThree();

  // Create shader material with proper WebGL context
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
  
  // Handle WebGL context loss
  useEffect(() => {
    const handleContextLost = (event: WebGLContextEvent) => {
      event.preventDefault();
      console.warn('WebGL context lost. Attempting to restore...');
    };

    const handleContextRestored = () => {
      console.log('WebGL context restored');
      if (glowMaterial) {
        glowMaterial.needsUpdate = true;
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      glowMaterial.dispose();
    };
  }, [gl, glowMaterial]);

  // Calculate vertex points with balanced sampling
  const points = useMemo(() => {
    if (!frames?.length || !frames[0]?.length) return [];

    const frameCount = frames.length;
    const samplesPerFrame = frames[0].length;
    const vertices: THREE.Vector3[] = [];

    // Use fixed steps to ensure even sampling
    const frameStep = Math.max(1, Math.floor(frameCount / 64));
    const sampleStep = Math.max(1, Math.floor(samplesPerFrame / 64));

    // Create points frame by frame
    for (let i = 0; i < frameCount; i += frameStep) {
      const frame = frames[i];
      const x = (i / (frameCount - 1)) * 2 - 1;

      for (let j = 0; j < samplesPerFrame; j += sampleStep) {
        const y = frame[j] * gain;
        const z = (j / (samplesPerFrame - 1)) * 2 - 1;
        vertices.push(new THREE.Vector3(x, y, z));
      }
    }

    return vertices;
  }, [frames, gain]);

  // Create optimized line geometry
  const lineGeometry = useMemo(() => {
    if (!points.length) return [];

    const frameCount = frames.length;
    const samplesPerFrame = frames[0].length;
    const lines: THREE.Vector3[][] = [];

    const frameStep = Math.max(1, Math.floor(frameCount / 64));
    const sampleStep = Math.max(1, Math.floor(samplesPerFrame / 64));
    const pointsPerFrame = Math.floor(samplesPerFrame / sampleStep);

    // Create vertical lines only (waveform slices)
    for (let i = 0; i < frameCount; i += frameStep) {
      const verticalLine: THREE.Vector3[] = [];
      const startIdx = (i / frameStep) * pointsPerFrame;
      
      // Create a single slice of the waveform
      for (let j = 0; j < pointsPerFrame; j++) {
        const idx = startIdx + j;
        if (idx < points.length) {
          verticalLine.push(points[idx]);
        }
      }

      if (verticalLine.length > 1) {
        lines.push(verticalLine);
      }
    }

    return lines;
  }, [points, frames]);

  // Debounced camera controls update
  const updateControls = useMemo(
    () => debounce(() => {
      if (controlsRef.current) {
        controlsRef.current.update();
      }
    }, 16), // 60fps
    []
  );

  useFrame(updateControls);

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
        {lineGeometry.map((line, index) => (
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
