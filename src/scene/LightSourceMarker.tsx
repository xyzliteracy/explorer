import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { DoubleSide } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import { shouldSelectFromClick } from './selectionClick';

// Authoring helper only: SceneRoot mounts markers in the orbital editor.
export function LightSourceMarker({ node, selected, onSelect }: {
  node: SpatialNode; selected: boolean; onSelect?: (id: string) => void;
}) {
  const { position, rotation, scale } = node.transform;
  const color = selected ? '#facc15' : '#fb923c';
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (shouldSelectFromClick(true, event)) onSelect?.(node.id);
  };
  return (
    <group position={position} rotation={rotation} onClick={select} userData={{ spatialNodeId: node.id, povCollisionIgnored: true }}>
      <mesh scale={scale}>
        <boxGeometry />
        <meshBasicMaterial color={color} transparent opacity={selected ? .2 : .1} depthWrite={false} side={DoubleSide} />
        <Edges color={color} />
      </mesh>
    </group>
  );
}
