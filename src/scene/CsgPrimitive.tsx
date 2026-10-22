import { useObservableMesh } from './observability';
import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { CsgExpression } from '../model/csg';
import { materialParameters } from './SpatialPrimitive';
import { evaluateCsgExpressionGeometry } from './csgGeometry';
import { shouldSelectFromClick } from './selectionClick';

interface CsgPrimitiveProps {
  expression: CsgExpression;
  tourMode?: boolean;
  onSelect?: (id: string) => void;
  selectionEnabled?: boolean;
}

export function CsgPrimitive({ expression, onSelect, selectionEnabled = true, tourMode = false }: CsgPrimitiveProps) {
  const geometry = useMemo(() => evaluateCsgExpressionGeometry(expression), [expression]);
  const observableMesh = useObservableMesh(expression.base, tourMode);
  const material = materialParameters(expression.base);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (shouldSelectFromClick(selectionEnabled, event)) onSelect?.(expression.base.id);
  }

  return (
    <mesh
      ref={observableMesh}
      castShadow
      receiveShadow
      geometry={geometry}
      onClick={handleClick}
      userData={{ spatialNodeId: expression.base.id, csgExpressionId: expression.id }}
    >
      <meshStandardMaterial {...material} />
    </mesh>
  );
}
