import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { matrixFromTransform } from '../model/transform';
import { observableFrom } from '../scene/observability';
const scene = (props: string, extra = '') => createSpatialDocument(`"Room/+1+4/+1+4/+1+4":"${props}"${extra}`);
const byFace = (props: string): Record<string, import('../model/SpatialNode').SpatialNode> => Object.fromEntries(scene(props).renderNodes.map(n => [n.metadata?.surfaceFace, n]));
describe('surface face shorthands', () => {
  it.each([
    ['1d white', ['white','white','white','white','white','white']],
    ['1d white, 2d red', ['white','red','white','red','red','red']],
    ['1d white, 2d red, 3d blue', ['white','red','white','red','blue','blue']],
    ['1d white, 2d red, 3d blue, 4d green, 5d gray, 6d black', ['white','red','blue','green','gray','black']],
  ])('expands %s in the documented order', (value, expected) => {
    const nodes = byFace(`box-surface: ${value}`);
    expect(['top','right','bottom','left','front','back'].map(f => nodes[f].material.color)).toEqual(expected);
  });
  it('supports omitted faces and unequal opposing thicknesses', () => {
    const doc = scene('box-surface: 1d white; box-surface-top: none; box-surface-bottom: 3d gray');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(5);
    expect(doc.renderNodes.find(n => n.metadata?.surfaceFace === 'bottom')!.box.height).toBeCloseTo(.3);
    expect(scene('box-surface: 1d white; box-surface-left: 39d red').renderNodes).toHaveLength(0);
    expect(scene('box-surface: 1d white; box-surface-left: 3 red; box-surface-right: none').renderNodes).toHaveLength(5);
  });
  it('applies shorthand and overrides in declaration order', () => {
    expect(byFace('box-surface-top: none; box-surface: 1d white').top).toBeDefined();
    expect(byFace('box-surface: 1d white; box-surface-top: none').top).toBeUndefined();
    expect(byFace('box-surface: 1d white; observable-top: false; observable: true').top.material.observable).toBe('+y');
    expect(byFace('box-surface: 1d white; observable: true; observable-top: false').top.material.observable).toBe(false);
  });
  it('keeps color function commas intact', () => {
    const doc = scene('box-surface: 1d rgb(255, 0, 0), 2d white, 1d hsl(120, 50%, 50%)');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes[0].material.color).toBe('rgb(255, 0, 0)');
  });
  it.each(['box-surface: 1d white, 1d red, 1d blue, none', 'box-surface: 1d white,', 'box-surface: 1d rgb(1,2,3', 'box-surface-top: 1d white', 'observable-top: true', 'observable: true,false', 'box-surface: 1d white; observable-top: maybe', 'box-surface: 1d white; observable-top:'])('diagnoses invalid input %s', props => {
    const doc = scene(props);
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(doc.renderNodes).toHaveLength(0);
  });
  it('makes true outward-facing, including rotated enclosures', () => {
    for (const rotation of ['', '; rotation: 30,60,90']) {
      const doc = scene(`box-surface: 1d white; observable: true${rotation}`);
      expect(doc.diagnostics).toEqual([]);
      for (const node of doc.renderNodes) {
        const direction = node.material.observable as string;
        const local = new Vector3();
        local[direction[1] as 'x'|'y'|'z'] = direction[0] === '+' ? 2 : -2;
        const matrix = matrixFromTransform(node.transform);
        const inverse = matrix.clone().invert();
        expect(observableFrom(node.material.observable, local.clone().applyMatrix4(matrix), inverse)).toBe(true);
        expect(observableFrom(node.material.observable, local.negate().applyMatrix4(matrix), inverse)).toBe(false);
      }
    }
    expect(Object.values(byFace('box-surface: 1d white; observable: true')).map(n => n.material.observable)).toEqual(['+y','-y','-z','+z','-x','+x']);
  });
  it('targets only the ceiling without affecting ordinary children', () => {
    const doc = scene('box-surface: 1d white; observable-top: true', '\n"Room/Chair/+1+1/+1+1/+1+1":"color: brown"');
    expect(doc.renderNodes.filter(n => n.material.observable)).toHaveLength(1);
    const all = scene('box-surface: 1d white; observable: true', '\n"Room/Chair/+1+1/+1+1/+1+1":"color: brown"');
    expect(all.renderNodes.find(n => !n.metadata?.surfaceFace)!.material.observable).toBeUndefined();
  });
  it('retains direction syntax and ordinary true behavior', () => {
    expect(scene('observable: true').renderNodes[0].material.observable).toBe('+z');
    expect(scene('box-surface: 1d white; observable: +y').renderNodes.every(n => n.material.observable === '+y')).toBe(true);
    const nodes = byFace('box-surface: 1d white; observable: true,false,+x');
    expect(nodes.top.material.observable).toBe('+y');
    expect(nodes.bottom.material.observable).toBe('-y');
    expect(nodes.left.material.observable).toBe(false);
    expect(nodes.front.material.observable).toBe('+x');
  });
  it('retains reference face settings with local overrides', () => {
    const doc = scene('box-surface: 1d white; observable: true', '\n"Copy/+6+4/+1+4/+1+4":"ref: Room; box-surface-top: none; observable-bottom: false"');
    expect(doc.diagnostics).toEqual([]);
    const copy = doc.renderNodes.filter(n => n.namespacePath?.startsWith('Copy/'));
    expect(copy).toHaveLength(5);
    expect(copy.find(n => n.metadata?.surfaceFace === 'bottom')!.material.observable).toBe(false);
    expect(copy.find(n => n.metadata?.surfaceFace === 'left')!.material.observable).toBe('-x');
  });
});
