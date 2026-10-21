import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { DoubleSide, Vector3 } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import { shouldSelectFromClick } from './selectionClick';

const FORWARD = new Vector3(0, 0, -1);
const ORIGIN = new Vector3();

// Authoring helper only: SceneRoot mounts markers in the orbital editor.
export function ViewPointMarker({ node, selected, onSelect }: {
  node: SpatialNode; selected: boolean; onSelect?: (id: string) => void;
}) {
  const { position, rotation, scale } = node.transform;
  const color = selected ? '#facc15' : '#22d3ee';
  const length = Math.max(.01, Math.min(...scale.map(Math.abs)) * .75);
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
      <arrowHelper args={[FORWARD, ORIGIN, length, color, length * .25, length * .15]} />
    </group>
  );
}
