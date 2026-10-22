import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
const room = '"Sal/+10d+366c/+10d+330c/+10d+391c":"box-surface: 1d white"';
const scene = (...lines: string[]) => createSpatialDocument(lines.join('\n'));
const child = (source: string) => scene(source).renderNodes.find(n => !n.metadata?.surfaceFace)!;
describe('enclosure interior coordinates', () => {
  it('places the supplied bed at the interior origin without resizing it', () => {
    const doc = scene(room, '"Sal/Bed/+0+155c/+0+8d/+0+205c":"model: salouis/wooden_bed.glb"');
    expect(doc.diagnostics).toEqual([]);
    const bed = doc.renderNodes.find(n => n.model?.source)!;
    expect(bed.box).toMatchObject({ x: .1, y: .1, z: .1, width: 1.55, height: .8, depth: 2.05 });
    expect(bed.bounds.minX).toBeCloseTo(1.1);
    expect(bed.bounds.minY).toBeCloseTo(1.1);
    expect(bed.bounds.minZ).toBeCloseTo(1.1);
  });
  it('fills the clear interior and aligns fixed boxes to its far edge', () => {
    const fill = child(`${room}\n"Sal/C/++/++/++":""`);
    expect(fill.box.width).toBeCloseTo(3.46);
    expect(fill.box.height).toBeCloseTo(3.1);
    expect(fill.box.depth).toBeCloseTo(3.71);
    const end = child(`${room}\n"Sal/C/++1/++1/++1":""`);
    expect(end.box.x).toBeCloseTo(2.56);
    expect(end.box.y).toBeCloseTo(2.2);
    expect(end.box.z).toBeCloseTo(2.81);
  });
  it('uses zero inset for omitted panels and respects asymmetric thickness', () => {
    const node = child(`${room.replace('1d white', '1d white; box-surface-left: none; box-surface-bottom: 2d gray; box-surface-back: 3d blue')}\n"Sal/C/++/++/++":""`);
    expect(node.box.x).toBe(0);
    expect(node.box.y).toBe(.2);
    expect(node.box.depth).toBeCloseTo(3.51);
    expect(node.box.width).toBeCloseTo(3.56);
  });
  it('skips namespace-only ancestors and adds nested enclosure insets once', () => {
    const doc = scene(room, '"Sal/Group":""', '"Sal/Group/Inner/+0+2/+0+2/+0+2":"box-surface: 2d gray"', '"Sal/Group/Inner/C/+0+1/+0+1/+0+1":""');
    expect(doc.diagnostics).toEqual([]);
    const node = doc.renderNodes.find(n => !n.metadata?.surfaceFace)!;
    expect(node.bounds.minX).toBeCloseTo(1.3);
    expect(node.bounds.minY).toBeCloseTo(1.3);
    expect(node.bounds.minZ).toBeCloseTo(1.3);
  });
  it('rotates the interior offset with the enclosure', () => {
    const node = child('"Sal/+1+4/+1+4/+1+4":"box-surface: 1d white; rotation: 0,0,90"\n"Sal/C/+0+1/+0+1/+0+1":""');
    expect(node.bounds.minX).toBeCloseTo(-.1);
    expect(node.bounds.minY).toBeCloseTo(1.1);
  });
  it('scales reference interior offsets exactly once', () => {
    const doc = scene('"Template/+0+2/+0+2/+0+2":"box-surface: 1d white"', '"Template/C/+0+1/+0+1/+0+1":""', '"Copy/+4+4/+0+6/+0+8":"ref: Template; ref-scale: true"');
    expect(doc.diagnostics).toEqual([]);
    const node = doc.renderNodes.find(n => n.namespacePath === 'Copy/C/')!;
    expect(node.bounds.minX).toBeCloseTo(4.2);
    expect(node.bounds.minY).toBeCloseTo(.3);
    expect(node.bounds.minZ).toBeCloseTo(.4);
  });
  it('repeats and clips against the interior boundaries', () => {
    const doc = scene('"Sal/+0+4/+0+2/+0+2":"box-surface: 2d white"', '"Sal/C/+0+1/+0+1/+0+1":"repeat: x; repeat-edge: clip"');
    expect(doc.diagnostics).toEqual([]);
    const nodes = doc.renderNodes.filter(n => !n.metadata?.surfaceFace);
    expect(nodes).toHaveLength(4);
    expect(nodes[0].bounds.minX).toBeCloseTo(.2);
    expect(nodes[3].bounds.maxX).toBeCloseTo(3.8);
    expect(doc.renderNodes.find(n => n.metadata?.surfaceFace === 'left')!.bounds.minX).toBeCloseTo(0);
  });
  it('does not inset ordinary containers or disabled surfaces', () => {
    for (const props of ['', 'box-surface: none']) {
      const node = child(`"Sal/+1+4/+1+4/+1+4":"${props}"\n"Sal/C/+0+1/+0+1/+0+1":""`);
      expect(node.box.x).toBe(0);
      expect(node.bounds.minX).toBeCloseTo(1);
    }
  });
});
