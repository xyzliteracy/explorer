import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import type { SpatialBounds, SpatialNode } from '../model/SpatialNode';
import { sceneBoundsFromNodes, updateCameraClipPlanes } from './cameraScale';

interface CameraClipControllerProps {
  nodes: readonly SpatialNode[];
  scale: number;
  selectionBounds?: SpatialBounds;
}

export function CameraClipController({ nodes, scale, selectionBounds }: CameraClipControllerProps) {
  const sceneBounds = useMemo(() => sceneBoundsFromNodes(nodes), [nodes]);

  useFrame(({ camera, invalidate }) => {
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return;
    if (updateCameraClipPlanes(camera as PerspectiveCamera, scale, sceneBounds, selectionBounds)) invalidate();
  });

  return null;
}
