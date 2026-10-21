import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, type BufferGeometry } from 'three';
import { RoundedBoxGeometry as RoundedBufferBoxGeometry } from 'three-stdlib';
import type { SpatialGeometry } from '../model/geometry';

const COMPACT_STRENGTH_MAX = 5;

export function normalizedXyzDslStrength(value?: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.min(Math.max(value, 0), COMPACT_STRENGTH_MAX) / COMPACT_STRENGTH_MAX;
}

export function normalizedRoundedBoxRadius(geometry: SpatialGeometry): number {
  const radius = geometry['box-radius'] ?? 0;
  const puff = normalizedXyzDslStrength(geometry.puff) ?? 0;

  if (radius <= 0 && puff <= 0) {
    return 0;
  }

  const smallestDimension = Math.min(...geometry.dimensions);

  if (smallestDimension <= 0) {
    return 0;
  }

  const puffRadius = puff * smallestDimension * 0.28;
  const clampedRadius = Math.min(Math.max(radius, puffRadius), smallestDimension / 2);

  return clampedRadius / smallestDimension;
}

export function bufferGeometryForSpatialGeometry(geometry: SpatialGeometry): BufferGeometry {
  switch (geometry.kind) {
    case 'cylinder':
      return new CylinderGeometry(0.5, 0.5, 1, 48);
    case 'cone':
      return new ConeGeometry(0.5, 1, 48);
    case 'sphere':
      return new SphereGeometry(0.5, 48, 24);
    case 'box': {
      const radius = normalizedRoundedBoxRadius(geometry);

      if (radius > 0) {
        const puff = normalizedXyzDslStrength(geometry.puff) ?? 0;
        const segments = 4 + Math.round(puff * 4);

        return new RoundedBufferBoxGeometry(1, 1, 1, segments, radius);
      }

      return new BoxGeometry(1, 1, 1);
    }
    default:
      return new BoxGeometry(1, 1, 1);
  }
}
