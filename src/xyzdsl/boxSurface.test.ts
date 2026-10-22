import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { selectionTargetForNodeId } from '../selection';

const room = '"Room/+10d+366c/+10d+330c/+10d+391c":"box-surface: 1d white;"';
const explicit = [
  '"Room/+10d+366c/+10d+330c/+10d+391c":""',
  '"Room/Ceiling/++/++1d/++":"color: white"',
  '"Room/Floor/++/+0+1d/++":"color: white"',
  '"Room/FrontWall/++/++/+0+1d":"color: white"',
  '"Room/BackWall/++/++/++1d":"color: white"',
  '"Room/LeftWall/+0+1d/++/++":"color: white"',
  '"Room/RightWall/++1d/++/++":"color: white"',
].join('\n');
const panels = (source: string) => createSpatialDocument(source).renderNodes.filter(n => n.metadata?.surfaceFace);

describe('box-surface', () => {
  it.each(['', 'rotation: 0,90,0;'])('matches six explicit panels including transforms (%s)', rotation => {
    const actual = createSpatialDocument(room.replace('box-surface:', `${rotation}box-surface:`));
    const expected = createSpatialDocument(explicit.replace(':""', `:"${rotation}"`));
    expect(actual.diagnostics).toEqual([]);
    expect(actual.renderNodes).toHaveLength(6);
    actual.renderNodes.forEach((node, i) => {
      expect(node.bounds).toEqual(expected.renderNodes[i].bounds);
      expect(node.material).toEqual(expected.renderNodes[i].material);
      expect(node.worldTransform).toEqual(expected.renderNodes[i].worldTransform);
      expect(node.metadata?.lineNumber).toBe(1);
      expect(selectionTargetForNodeId(actual.nodes, node.id)?.id).toBe(actual.nodes[0].id);
    });
    expect(actual.nodes[0].renderable).toBe(false);
  });
  it('keeps child geometry, color and names independent', () => {
    const doc = createSpatialDocument(`${room}\n"Room/Floor/+1+1/+0+1/+1+1":"color: brown"`);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(7);
    expect(doc.renderNodes.find(n => !n.metadata?.surfaceFace)?.material.color).toBe('brown');
    expect(new Set(doc.renderNodes.map(n => n.id)).size).toBe(7);
  });
  it.each(['', '0 white', '-1 white', '1d', 'wat white', '2 white', '1d white; model: test.glb', '1d white; geometry: sphere', '1d white; operation: subtraction', '1d white; light-source: true', '1d white; view-point: true'])('diagnoses and omits invalid surfaces: %s', value => {
    const doc = createSpatialDocument(room.replace('1d white;', value));
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(doc.renderNodes).toHaveLength(0);
  });
  it('resolves fill before creating panels', () => {
    const doc = createSpatialDocument('"Parent/+0+4/+0+3/+0+4":""\n"Parent/Room/++/++/++":"box-surface: 1d white"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(6);
    expect(doc.renderNodes[0].box.width).toBe(4);
  });
  it('supports anonymous boxes', () => {
    const doc = createSpatialDocument('"+1+4/+2+3/+3+4":"box-surface: 1d white"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(6);
    expect(doc.renderNodes[0].bounds.minX).toBeCloseTo(1);
    expect(doc.renderNodes[0].bounds.maxY).toBeCloseTo(5);
  });
  it('copies reference surfaces and supports explicit cancellation', () => {
    const source = `${room}\n"Copy/+0+4/+0+4/+0+4":"ref: Room"`;
    expect(panels(source)).toHaveLength(12);
    const cancelled = createSpatialDocument(source.replace('ref: Room', 'ref: Room; box-surface: none'));
    expect(cancelled.diagnostics).toEqual([]);
    expect(cancelled.renderNodes).toHaveLength(7);
  });
  it('scales reference panels and thickness exactly once', () => {
    const doc = createSpatialDocument('"Template/+0+2/+0+2/+0+2":"box-surface: 1d white"\n"Copy/+3+4/+0+6/+0+8":"ref: Template; ref-scale: true"');
    expect(doc.diagnostics).toEqual([]);
    const floor = doc.renderNodes.find(n => n.namespacePath?.startsWith('Copy/') && n.metadata?.surfaceFace === 'floor')!;
    expect(floor.bounds.maxX - floor.bounds.minX).toBeCloseTo(4);
    expect(floor.bounds.maxY - floor.bounds.minY).toBeCloseTo(.3);
    expect(floor.bounds.maxZ - floor.bounds.minZ).toBeCloseTo(8);
  });
  it('repeats surfaces with unique deterministic identities', () => {
    const source = '"Parent/+0+6/+0+2/+0+2":""\n"Parent/Room/+0+2/++/++":"box-surface: 1d white; repeat: x; repeat-edge: clip"';
    const doc = createSpatialDocument(source);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(18);
    expect(new Set(doc.renderNodes.map(n => n.id)).size).toBe(18);
    expect(doc.renderNodes.map(n => n.id)).toEqual(createSpatialDocument(source).renderNodes.map(n => n.id));
    expect(doc.renderNodes.every(n => n.clippingPlanes?.length)).toBe(true);
  });
  it('omits an entire root when panels exceed the generation budget', () => {
    const doc = createSpatialDocument('"Parent/+0+4000/+0+2/+0+2":""\n"Parent/Room/+0+2/++/++":"box-surface: 1d white; repeat: x"');
    expect(doc.renderNodes).toHaveLength(0);
    expect(doc.diagnostics.some(d => d.message.includes('budget'))).toBe(true);
  });
  it('omits CSG tools intersecting panels with a diagnostic', () => {
    const doc = createSpatialDocument(`${room}\n"Cut/+1+1/+1+1/+1+1":"operation: subtraction"`);
    expect(doc.diagnostics.some(d => d.message.includes('CSG'))).toBe(true);
    expect(doc.renderNodes).toHaveLength(6);
    expect(doc.csgExpressions).toHaveLength(0);
  });
  it('keeps subtree surfaces when copying a compound template', () => {
    const doc = createSpatialDocument('"Template":""\n"Template/Room/+0+2/+0+2/+0+2":"box-surface: 1d white"\n"Copy/+0+4/+0+4/+0+4":"ref: Template; ref-scale: true"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(6);
    expect(doc.renderNodes.find(n => n.metadata?.surfaceFace === 'floor')!.bounds.maxY).toBeCloseTo(.2);
  });
  it('resolves chained references and local overrides', () => {
    const doc = createSpatialDocument(`${room}\n"Copy/+0+4/+0+4/+0+4":"ref: Room"\n"Third/+0+4/+0+4/+0+4":"ref: Copy; box-surface: 2d blue"`);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(18);
    expect(doc.renderNodes.filter(n => n.material.color === 'blue')).toHaveLength(6);
  });

  it('rejects namespace-only rules even when referenced', () => {
    const doc = createSpatialDocument('"Template":"box-surface: 1d white"\n"Copy/+0+4/+0+4/+0+4":"ref: Template"');
    expect(doc.diagnostics.some(d => d.message.includes('concrete box'))).toBe(true);
    expect(doc.renderNodes).toHaveLength(0);
  });

});
