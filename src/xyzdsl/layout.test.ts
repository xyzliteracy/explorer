import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { moveDeclarationPath, resizeDeclarationPath } from './editXyzDslSource';
import { parseAxisSpec, parseXyzDslDocument } from './parser';
import { resolveXyzDslDocument } from './resolveDocument';

const wall = '"Wall/+0+5/+0+3/+0+2d" : ""';
const scene = (...lines: string[]) => createSpatialDocument(lines.join('\n'));

describe('parent-relative axes', () => {
  it.each(['++', '+0+'])('parses %s as zero offset and fill, not numeric zero', axis => {
    expect(parseAxisSpec(axis, 'x')).toEqual({ axis: 'x', offset: 0, size: 'fill' });
  });
  it('supports omitted offsets with explicit sizes and metric offsets with fill', () => {
    expect(parseAxisSpec('++2d', 'x')).toEqual({ axis: 'x', offset: 'end', size: 0.2 });
    expect(parseAxisSpec('+2d+', 'x')).toEqual({ axis: 'x', offset: 0.2, size: 'fill' });
  });
  it('aligns all fixed axes to the far edge through namespace-only ancestors', () => {
    const doc = scene(wall, '"Wall/Group":""', '"Wall/Group/C/++1/++2d/++1c":""');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes[0].box).toMatchObject({ x: 4, y: 2.8, z: .19, width: 1, height: .2, depth: .01 });
    expect(doc.renderNodes[0].box.endAxes).toBeUndefined();
  });
  it.each(['whole', 'clip'])('keeps forward repetition at one far-edge copy (%s)', edge => {
    const doc = scene(wall, `"Wall/C/++1/+0+1/+0+1":"repeat: x; repeat-gap: 1m; repeat-edge: ${edge}"`);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(1);
    expect(doc.renderNodes[0].box.x).toBe(4);
  });
  it.each(['"C/++1/+0+1/+0+1":""', `${wall}\n"Wall/C/++6/+0+1/+0+1":""`])('rejects missing parents and oversized aligned children', source => {
    const doc = scene(source);
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(doc.renderNodes).toHaveLength(0);
  });
  it('allows exact fits and resolves alignment before parent rotation', () => {
    const doc = scene(wall.replace(': ""', ': "rotation: 0,0,90"'), '"Wall/C/++1/++3/++2d":""');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes[0].box).toMatchObject({ x: 4, y: 0, z: 0 });
    expect(doc.renderNodes[0].bounds.maxY).toBeCloseTo(5);
  });
  it('preserves alignment when editing sizes or nudging other axes', () => {
    const source = '"Wall/C/++1/+0+1/+0+1":""';
    expect(moveDeclarationPath(source, 1, 'x', .1)).toBe(source);
    expect(resizeDeclarationPath(source, 1, 'x', .1)).toContain('/++11d/');
  });
  it.each(['Wall/++/++', 'Wall/++/++/++/++', 'Wall/+++/++/++', 'Wall/+01+/++/++', 'Wall/++0/++/++', 'Wall/*/++/++'])(
    'rejects invalid axis syntax %s', path => expect(parseXyzDslDocument(`"${path}" : ""`).ok).toBe(false),
  );
  it('fills from the offset and keeps the other dimensions fixed', () => {
    const doc = scene(wall, '"Wall/Rail/+2d+/+1+1d/+0+2d" : ""');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes[0].box).toMatchObject({ x: 0.2, width: 4.8, y: 1, height: 0.1 });
    expect(doc.renderNodes[0].bounds.maxX).toBeCloseTo(5);
    expect(doc.renderNodes[0].box.fillAxes).toBeUndefined();
  });
  it('resolves nested fills through namespace-only ancestors, regardless of declaration order', () => {
    const doc = scene('"Wall/Group/Panel/Face/++/++/++" : ""', '"Wall/Group" : "color: red"',
      '"Wall/Group/Panel/+1+/++/+0+2c" : ""', wall);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes[0].box).toMatchObject({ width: 4, height: 3, depth: 0.02 });
  });
  it('fills before parent rotation', () => {
    const doc = scene(wall.replace(': ""', ': "rotation: 0,0,90"'), '"Wall/Rail/++/+0+1/+0+2d" : ""');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes[0].box.width).toBe(5);
    expect(doc.renderNodes[0].bounds.maxY).toBeCloseTo(5);
  });
  it.each(['"Rail/++/+0+1/+0+1" : ""', `${wall}\n"Wall/Rail/+5+/+0+1/+0+1" : ""`])(
    'diagnoses fill without positive available space', source => {
      const doc = scene(source);
      expect(doc.diagnostics.length).toBeGreaterThan(0);
      expect(doc.renderNodes).toHaveLength(0);
    },
  );
  it('keeps fill syntax when moving or resizing another axis', () => {
    const source = '"Wall/Rail/++/+0+1/+0+1" : ""';
    expect(moveDeclarationPath(source, 1, 'x', 0.2)).toContain('Rail/+2d+/');
    expect(resizeDeclarationPath(source, 1, 'y', 1)).toContain('Rail/++/+0+2/');
    expect(resizeDeclarationPath(source, 1, 'x', 1)).toBe(source);
  });
});

describe('repetition', () => {
  it('repeats full-height slats with gaps and stable source identities', () => {
    const source = [wall, '"Wall/Slat/+0+1d/++/+0+2d" : "repeat: x; repeat-gap: 1d"'].join('\n');
    const doc = scene(source);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(25);
    expect(doc.renderNodes.at(-1)?.box).toMatchObject({ width: 0.1, height: 3 });
    expect(doc.renderNodes.at(-1)?.box.x).toBeCloseTo(4.8);
    expect(new Set(doc.renderNodes.map(n => n.id)).size).toBe(25);
    expect(doc.renderNodes.at(-1)?.metadata).toMatchObject({ lineNumber: 2, repeatIndices: [24, 0, 0] });
    expect(scene(source).renderNodes.map(n => n.id)).toEqual(doc.renderNodes.map(n => n.id));
  });
  it('includes a decimal exact-fit boundary without adding an extra copy', () => {
    const doc = scene('"P/+0+3d/+0+1/+0+1" : ""', '"P/C/+0+1d/+0+1/+0+1" : "repeat: x"');
    expect(doc.renderNodes).toHaveLength(3);
  });
  it('leaves leftover space at the far edge and respects the initial offset', () => {
    const doc = scene(wall, '"Wall/C/+1+15d/+0+1/+0+1" : "repeat: x; repeat-gap: 5d"');
    expect(doc.renderNodes.map(n => n.box.x)).toEqual([1, 3]);
  });
  it('emits no copies when none fit', () => {
    const doc = scene(wall, '"Wall/C/+0+6/+0+1/+0+1" : "repeat: x"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(0);
  });
  it('repeats complete subtrees in a grid without inheriting repeat onto children', () => {
    const doc = scene('"P/+0+2/+0+1/+0+2" : ""',
      '"P/Tile/+0+1/+0+1/+0+1" : "repeat: x,z"',
      '"P/Tile/Face/++/++/++" : "color: red"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.nodes[0].children).toHaveLength(4);
    expect(doc.renderNodes).toHaveLength(4);
    expect(doc.renderNodes.map(n => n.worldTransform?.position)).toEqual([
      [0.5, 0.5, 0.5], [0.5, 0.5, 1.5], [1.5, 0.5, 0.5], [1.5, 0.5, 1.5],
    ]);
    expect(doc.renderNodes.every(n => n.metadata?.lineNumber === 3)).toBe(true);
  });
  it('supports nested repetition and avoids collisions with authored namespaces', () => {
    const doc = scene('"P/+0+4/+0+1/+0+1" : ""',
      '"P/C/+0+2/+0+1/+0+1" : "repeat: x"',
      '"P/C/D/+0+1/+0+1/+0+1" : "repeat: x"',
      '"P/Crepeat0/+0+1/+0+1/+0+1" : ""');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(5);
    expect(new Set(doc.renderNodes.map(n => n.namespacePath)).size).toBe(5);
  });
  it.each(['repeat: x; repeat-gap: -1', 'repeat: x,x', 'repeat: q', 'repeat-gap: 1', 'repeat: x; repeat-gap: Infinity'])(
    'diagnoses invalid repeat settings %s', properties => {
      const doc = scene(wall, `"Wall/C/+0+1/+0+1/+0+1" : "${properties}"`);
      expect(doc.diagnostics.length).toBeGreaterThan(0);
      expect(doc.renderNodes).toHaveLength(0);
    },
  );
  it('rejects fill and repeat on the same axis', () => {
    const doc = scene(wall, '"Wall/C/++/+0+1/+0+1" : "repeat: x"');
    expect(doc.diagnostics[0].message).toContain('both fill');
    expect(doc.renderNodes).toHaveLength(0);
  });
  it('feeds generated subtraction tools into CSG after layout', () => {
    const doc = scene('"P/+0+5/+0+1/+0+1" : ""',
      '"P/Body/++/++/++" : ""',
      '"P/Hole/+0+1/+0+1/+0+1" : "repeat: x; repeat-gap: 1; operation: subtraction"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.csgExpressions).toHaveLength(1);
    expect(doc.csgExpressions[0].operations).toHaveLength(3);
    expect(doc.csgExpressions[0].operations.map(op => op.tool.box.x)).toEqual([0, 2, 4]);
  });
  it('applies named replacement before generating copies', () => {
    const doc = scene(wall,
      '"Wall/C/+0+1/+0+1/+0+1" : "repeat: x"',
      '"Wall/C/+0+2/+0+1/+0+1" : "repeat: x"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(2);
    expect(doc.renderNodes.every(n => n.metadata?.lineNumber === 3)).toBe(true);
  });
  it('rejects excessive repetition before allocating copies', () => {
    const doc = scene('"P/+0+100/+0+1/+0+1" : ""',
      '"P/C/+0+1m/+0+1/+0+1" : "repeat: x"');
    expect(doc.diagnostics.some(d => d.message.includes('instance limit'))).toBe(true);
    expect(doc.renderNodes).toHaveLength(0);
  });
  it('bounds nested generation across the document', () => {
    const parsed = parseXyzDslDocument('"P/+0+100/+0+1/+0+1" : ""\n"P/C/+0+1/+0+1/+0+1" : "repeat: x"\n"P/C/D/+0+1m/+0+1/+0+1" : "repeat: x"');
    const resolved = resolveXyzDslDocument(parsed.value!);
    expect(resolved.diagnostics.some(d => d.message.includes('budget'))).toBe(true);
    expect(resolved.objects).toHaveLength(0);
  });
});

describe('layout and references', () => {
  it('resolves aligned template children under reference scaling', () => {
    const doc = scene('"Template/+0+2/+0+1/+0+1":""',
      '"Template/Part/++1/++/++":""',
      '"Copy/+0+6/+0+2/+0+2":"ref: Template; ref-scale: true"');
    expect(doc.diagnostics).toEqual([]);
    const part = doc.renderNodes.find(n => n.namespacePath?.startsWith('Copy/'))!;
    expect(part.bounds.minX).toBeCloseTo(3);
    expect(part.bounds.maxX).toBeCloseTo(6);
  });
  it('evaluates template child layout against each instance', () => {
    const doc = scene('"Template" : ""', '"Template/Slat/+0+1/++/++" : "repeat: x"',
      '"Copy/+0+3/+0+2/+0+1" : "ref: Template"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(3);
    expect(doc.renderNodes[0].box).toMatchObject({ width: 1, height: 2, depth: 1 });
  });
  it('resolves filled reference targets and applies ref-scale exactly once', () => {
    const doc = scene('"Template/+0+2/+0+1/+0+1" : ""',
      '"Template/Slat/+0+1/++/++" : "repeat: x"', wall,
      '"Wall/Copy/++/++/++" : "ref: Template; ref-scale: true"');
    expect(doc.diagnostics).toEqual([]);
    const copies = doc.renderNodes.filter(n => n.namespacePath?.startsWith('Wall/Copy/'));
    expect(copies).toHaveLength(2);
    expect(copies[1].bounds.maxX).toBeCloseTo(5);
    expect(copies[1].bounds.maxY).toBeCloseTo(3);
    expect(copies[1].bounds.maxZ).toBeCloseTo(0.2);
  });
  it('repeats a compound reference with its children', () => {
    const doc = scene('"Template" : ""', '"Template/Part/++/++/++" : ""', wall,
      '"Wall/Copy/+0+1/++/++" : "ref: Template; repeat: x"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(5);
    expect(doc.renderNodes.at(-1)?.bounds.maxX).toBeCloseTo(5);
  });
  it('diagnoses indefinite source dimensions for ref-scale', () => {
    const doc = scene('"Template" : ""', '"Template/Part/++/++/++" : ""',
      '"Copy/+0+1/+0+1/+0+1" : "ref: Template; ref-scale: true"');
    expect(doc.diagnostics.some(d => d.message.includes('definite positive template dimensions'))).toBe(true);
    expect(doc.renderNodes).toHaveLength(0);
  });
});
