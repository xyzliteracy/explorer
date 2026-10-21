import { describe, expect, it } from 'vitest';
import { BoxGeometry } from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { bufferGeometryForSpatialGeometry } from './primitiveGeometry';
import type { SpatialGeometry } from '../model/geometry';

function boxGeometry(overrides: Partial<SpatialGeometry> = {}): SpatialGeometry {
  return {
    kind: 'box',
    dimensions: [4, 2, 3],
    ...overrides,
  };
}

describe('bufferGeometryForSpatialGeometry', () => {
  it('creates plain box geometry when no box modifiers are declared', () => {
    expect(bufferGeometryForSpatialGeometry(boxGeometry())).toBeInstanceOf(BoxGeometry);
  });

  it('preserves box-radius modifiers for generated boolean brush geometry', () => {
    expect(bufferGeometryForSpatialGeometry(boxGeometry({ 'box-radius': 0.2 }))).toBeInstanceOf(RoundedBoxGeometry);
  });

  it('preserves puff modifiers for generated boolean brush geometry', () => {
    expect(bufferGeometryForSpatialGeometry(boxGeometry({ puff: 5 }))).toBeInstanceOf(RoundedBoxGeometry);
  });
});
