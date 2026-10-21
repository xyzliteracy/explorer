import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { insideClipPlanes, threeClipPlanes } from '../model/clipping';
import { matrixFromTransform } from '../model/transform';
import { clippedMeshRaycast, installClippedRaycast } from './clipping';
import { sweptSphereIntersectsScene } from './povCollision';
import { evaluateCsgExpressionGeometry } from './csgGeometry';

const floor = '"Flooring/+2+109d/+66c+1c/+1d+397c":""';
const tile = '"Flooring/Tiling/+0+6d/+0+6d/+0+6d":"model: floor_tiling.glb; rotation: 90,0,0; repeat: x,z; repeat-gap: 1m; repeat-edge: clip"';
const scene = (...lines: string[]) => createSpatialDocument(lines.join('\n'));

describe('repeat-edge: clip', () => {
  it('covers the supplied floor with 19 by 7 full-scale tiles and clipped edge bounds', () => {
    const doc = scene(floor, tile);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(133);
    const edge = doc.renderNodes.at(-1)!;
    expect(edge.box).toMatchObject({ width: 0.6, height: 0.6, depth: 0.6 });
    expect(edge.transform.scale).toEqual([0.6, 0.6, 0.6]);
    expect(edge.bounds.maxX).toBeCloseTo(12.9);
    expect(edge.bounds.maxZ).toBeCloseTo(4.07);
    expect(edge.bounds.maxX - edge.bounds.minX).toBeCloseTo(0.082);
    expect(edge.bounds.maxZ - edge.bounds.minZ).toBeCloseTo(0.364);
    expect(edge.bounds.minY).toBeCloseTo(0.66);
    expect(edge.bounds.maxY).toBeCloseTo(1.26); // Not clipped by the 1 cm parent height.
    expect(edge.clippingPlanes).toHaveLength(4);
    expect(edge.clippingPlanes!.every(p => p.normal[1] === 0)).toBe(true);
  });
  it('preserves the default whole-tile policy', () => {
    const doc = scene(floor, tile.replace('repeat-edge: clip', 'repeat-edge: whole'));
    expect(doc.renderNodes).toHaveLength(108);
    expect(doc.renderNodes[0].clippingPlanes).toBeUndefined();
  });
  it.each([
    ['+0+12d', 'repeat-gap: 0', 2],
    ['+0+1202m', 'repeat-gap: 1m', 2], // Exact next start: no zero-width tile.
    ['+0+1203m', 'repeat-gap: 1m', 3],
    ['+0+605m', 'repeat-gap: 1c', 1], // Remainder lies wholly inside the grout gap.
    ['+0+2d', 'repeat-gap: 0', 1],
  ])('handles exact fit and small remainders %s %s', (axis, gap, count) => {
    const doc = scene(`"P/${axis}/+0+1/+0+1":""`, `"P/C/+0+6d/+0+1/+0+1":"repeat: x; ${gap}; repeat-edge: clip"`);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(count);
  });
  it('does not emit copies when the offset is at or past the parent edge', () => {
    for (const offset of ['1', '2']) {
      expect(scene('"P/+0+1/+0+1/+0+1":""', `"P/C/+${offset}+6d/+0+1/+0+1":"repeat: x; repeat-edge: clip"`).renderNodes).toHaveLength(0);
    }
  });
  it.each(['repeat-edge: trim; repeat: x', 'repeat-edge: clip'])('diagnoses invalid settings: %s', properties => {
    const doc = scene(floor, `"Flooring/C/+0+1/+0+1/+0+1":"${properties}"`);
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(doc.renderNodes).toHaveLength(0);
  });
  it('inherits clip boundaries through repeated subtrees and nested repetitions', () => {
    const doc = scene('"P/+0+1/+0+1/+0+1":""',
      '"P/C/+0+6d/+0+1/+0+1":"repeat: x; repeat-edge: clip"',
      '"P/C/D/+0+6d/+0+1/+0+6d":"repeat: z; repeat-edge: clip"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes).toHaveLength(4);
    const edge = doc.renderNodes.at(-1)!;
    expect(edge.clippingPlanes).toHaveLength(4);
    expect(edge.bounds.maxX).toBeCloseTo(1);
    expect(edge.bounds.maxZ).toBeCloseTo(1);
    expect(edge.box.width).toBe(0.6);
  });
  it('clips in rotated/scaled parent axes, independently of child rotation', () => {
    const doc = scene('"T/+0+1/+0+1/+0+1":""',
      '"T/C/+0+6d/+0+1/+0+6d":"repeat: x,z; repeat-edge: clip; rotation: 0,45,0"',
      '"Copy/+3+2/+2+1/+4+3":"ref: T; ref-scale: true; rotation: 0,30,0"');
    expect(doc.diagnostics).toEqual([]);
    const parent = doc.nodes.find(n => n.namespacePath === 'Copy/')!;
    const child = parent.children!.at(-1)!;
    const matrix = matrixFromTransform(parent.worldTransform!);
    expect(insideClipPlanes(new Vector3(0.9, 0.5, 0.9).applyMatrix4(matrix), child.clippingPlanes!)).toBe(true);
    expect(insideClipPlanes(new Vector3(1.1, 0.5, 0.9).applyMatrix4(matrix), child.clippingPlanes!)).toBe(false);
    expect(insideClipPlanes(new Vector3(0.9, 5, 0.9).applyMatrix4(matrix), child.clippingPlanes!)).toBe(true);
  });
  it('clips CSG operands before subtraction rather than cutting beyond the parent', () => {
    const doc = scene('"P/+0+1/+0+1/+0+1":""',
      '"P/Body/+0+2/+0+1/+0+1":""',
      '"P/Hole/+8d+6d/+0+1/+0+1":"repeat: x; repeat-edge: clip; operation: subtraction"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.csgExpressions).toHaveLength(1);
    const geometry = evaluateCsgExpressionGeometry(doc.csgExpressions[0]);
    const mesh = new Mesh(geometry);
    mesh.updateMatrixWorld();
    // The tool is cropped at x=1. Geometry from x=1 to x=1.4 must survive.
    expect(new Raycaster(new Vector3(1.2, 2, 0.5), new Vector3(0, -1, 0)).intersectObject(mesh).length).toBeGreaterThan(0);
    expect(new Raycaster(new Vector3(0.9, 2, 0.5), new Vector3(0, -1, 0)).intersectObject(mesh)).toHaveLength(0);
    geometry.dispose();
  });
});

describe('clipped rendering interaction', () => {
  function clippedSurface() {
    const group = new Group();
    group.userData.spatialNodeId = 'tile';
    group.userData.xyzClippingPlanes = [{ normal: [-1, 0, 0], constant: 0 }];
    const mesh = new Mesh(new PlaneGeometry(2, 2), new MeshStandardMaterial());
    mesh.material.clippingPlanes = threeClipPlanes(group.userData.xyzClippingPlanes);
    mesh.material.clipShadows = true;
    installClippedRaycast(mesh);
    group.add(mesh);
    group.updateMatrixWorld(true);
    return { group, mesh };
  }
  it('lets selection rays pass through cropped triangles but retains visible hits', () => {
    const { group } = clippedSurface();
    expect(new Raycaster(new Vector3(0.5, 0, 1), new Vector3(0, 0, -1)).intersectObject(group, true)).toEqual([]);
    expect(new Raycaster(new Vector3(-0.5, 0, 1), new Vector3(0, 0, -1)).intersectObject(group, true).length).toBeGreaterThan(0);
  });
  it('also clips the model selection proxy', () => {
    const { group } = clippedSurface();
    const proxy = new Mesh(new BoxGeometry(2, 2, 2));
    proxy.raycast = clippedMeshRaycast;
    proxy.userData.povCollisionIgnored = true;
    group.add(proxy); group.updateMatrixWorld(true);
    expect(new Raycaster(new Vector3(0.5, 0, 2), new Vector3(0, 0, -1)).intersectObject(group, true)).toEqual([]);
  });
  it('clips collision triangles crossing an edge, including swept sphere radius', () => {
    const { group } = clippedSurface();
    expect(sweptSphereIntersectsScene(group, new Vector3(0.5, 0, 1), new Vector3(0.5, 0, -1), 0.1)).toBe(false);
    expect(sweptSphereIntersectsScene(group, new Vector3(-0.5, 0, 1), new Vector3(-0.5, 0, -1), 0.1)).toBe(true);
    // The center is outside, but the sphere still touches the visible clipped edge.
    expect(sweptSphereIntersectsScene(group, new Vector3(0.05, 0, 1), new Vector3(0.05, 0, -1), 0.1)).toBe(true);
  });
});
