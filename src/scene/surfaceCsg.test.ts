import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { evaluateCsgExpressionGeometry } from './csgGeometry';
const room = '"Room/+1+4/+1+4/+1+4":"box-surface: 1d white; observable: true"';
describe('enclosure panel CSG', () => {
  it('cuts a real opening while retaining the surrounding wall and its properties', () => {
    const doc = createSpatialDocument(`${room}\n"Window/+9d+3d/+2+1/+2+1":"operation: subtraction"`);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.csgExpressions).toHaveLength(1);
    const expression = doc.csgExpressions[0];
    expect(expression.base.metadata?.surfaceFace).toBe('left');
    expect(expression.base.material.observable).toBe('-x');
    expect(expression.base.material.color).toBe('white');
    const geometry = evaluateCsgExpressionGeometry(expression);
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material); mesh.updateMatrixWorld(true);
    expect(new Raycaster(new Vector3(0, 2.5, 2.5), new Vector3(1, 0, 0)).intersectObject(mesh)).toHaveLength(0);
    expect(new Raycaster(new Vector3(0, 1.5, 2.5), new Vector3(1, 0, 0)).intersectObject(mesh).length).toBeGreaterThan(0);
    geometry.dispose(); material.dispose();
  });
  it.each(['subtraction', 'intersection'])('applies %s to both walls at a corner and consumes the tool', operation => {
    const doc = createSpatialDocument(`${room}\n"Corner/+9d+3d/+2+1/+9d+3d":"operation: ${operation}"`);
    expect(doc.csgExpressions).toHaveLength(2);
    expect(new Set(doc.csgExpressions.map(e => e.base.metadata?.surfaceFace))).toEqual(new Set(['left','front']));
    expect(doc.renderNodes).toHaveLength(4);
    for (const expression of doc.csgExpressions) {
      expect(expression.operations[0].tool.csgConsumed).toBe(true);
      const geometry = evaluateCsgExpressionGeometry(expression);
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
      geometry.dispose();
    }
  });
  it('adds union geometry only once', () => {
    const doc = createSpatialDocument(`${room}\n"Corner/+9d+3d/+2+1/+9d+3d":"operation: union"`);
    expect(doc.csgExpressions).toHaveLength(1);
    expect(doc.renderNodes).toHaveLength(5);
  });
  it('preserves operation order across shared tools', () => {
    const doc = createSpatialDocument(`${room}\n"Corner/+9d+3d/+2+1/+9d+3d":"operation: subtraction"\n"Second/+9d+3d/+21d+5d/+9d+3d":"operation: subtraction"`);
    expect(doc.csgExpressions).toHaveLength(2);
    expect(doc.csgExpressions.every(e => e.operations.length === 2)).toBe(true);
    expect(doc.csgExpressions[0].operations.map(o => o.tool.metadata?.lineNumber)).toEqual([2,3]);
  });
  it('does not apply a tool to later enclosures or omitted faces', () => {
    const doc = createSpatialDocument(`"Window/+9d+3d/+2+1/+2+1":"operation: subtraction"\n${room}`);
    expect(doc.csgExpressions).toHaveLength(0);
    const open = createSpatialDocument(`${room.replace('observable: true', 'box-surface-left: none')}\n"Window/+9d+3d/+2+1/+2+1":"operation: subtraction"`);
    expect(open.csgExpressions).toHaveLength(0);
  });
});
