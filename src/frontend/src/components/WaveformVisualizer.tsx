import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import styled from 'styled-components';

const VisualizerContainer = styled.div`
  width: 100%;
  height: 400px;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
`;

interface Props {
  waveformType: string;
  waveform: number[];
  spectrum: number[];
  width?: number;
  height?: number;
}

interface WaveformMeshProps {
  data: number[];
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

const WaveformMesh: React.FC<WaveformMeshProps> = ({
  data,
  color = '#4CAF50',
  position = [0, 0, 0],
  scale = [1, 1, 1]
}) => {
  const points = React.useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      data.map((y, i) => new THREE.Vector3(
        (i / (data.length - 1) - 0.5) * 2,
        y,
        0
      ))
    );
    return curve.getPoints(200);
  }, [data]);

  return (
    <group position={new THREE.Vector3(...position)} scale={new THREE.Vector3(...scale)}>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length}
            array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} linewidth={2} />
      </line>
    </group>
  );
};

const SpectrumMesh: React.FC<SpectrumMeshProps> = ({
  data,
  color = '#2196f3',
  position = [0, 0, 0],
  scale = [1, 1, 1]
}) => {
  const points = React.useMemo(() => {
    return data.map((y, i) => new THREE.Vector3(
      (i / (data.length - 1) - 0.5) * 2,
      y * 0.5, // Scale down the spectrum height
      0
    ));
  }, [data]);

  return (
    <group position={new THREE.Vector3(...position)} scale={new THREE.Vector3(...scale)}>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length}
            array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} linewidth={2} opacity={0.7} transparent />
      </line>
    </group>
  );
};

const WaveformVisualizer: React.FC<Props> = ({
  waveform,
  spectrum,
  width = 800,
  height = 400
}) => {
  return (
    <VisualizerContainer style={{ width, height }}>
      <Canvas camera={{ position: [0, 0, 3], fov: 60 }}>
        <color attach="background" args={['#1a1a1a']} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />

        <WaveformMesh
          data={waveform}
          scale={[2, 1, 1]}
          position={[0, 0.75, 0]}
          color="#00ff00"
        />

        {spectrum && (
          <SpectrumMesh
            data={spectrum}
            scale={[2, 1, 1]}
            position={[0, -0.75, -2]}
            color="#2196f3"
          />
        )}

        <gridHelper args={[4, 20]} position={[0, 0, -0.5]} />
        
        <OrbitControls
          enableZoom={true}
          enablePan={true}
          enableRotate={true}
          target={[0, 0, 0]}
        />
      </Canvas>
    </VisualizerContainer>
  );
};

export default WaveformVisualizer;
