import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three';
import { observableFrom } from './observability';
import { matrixFromTransform } from '../model/transform';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { brushFor, evaluateCsgExpressionGeometry } from './csgGeometry';

const rooms = '"Rooms/+0+366c/+0+330c/+0+622c":"box-surface: 1d #fffdd0; box-partition: 1d gray; box-grid-columns: 140c 196c; box-grid-rows: 1; box-grid-slices: 371c 221c; box-grid-areas: bedroom bedroom / . annex; observable: true;"';

// Test world geometry independently of the topology implementation's occupancy map.
function meshesFor(source: string) {
 const doc = createSpatialDocument(source);
 expect(doc.diagnostics).toEqual([]);
 const material = new MeshBasicMaterial({ side: DoubleSide });
 const meshes = [...doc.renderNodes, ...doc.csgExpressions.map(e => e.base)].filter(n => !n.model && !n.csgConsumed).map(n => {
  const expression = doc.csgExpressions.find(e => e.base.id === n.id);
  const geometry = expression ? evaluateCsgExpressionGeometry(expression) : brushFor(n).geometry;
  const mesh = new Mesh(geometry, material); mesh.updateMatrixWorld(true); return mesh;
 });
 return { doc, meshes, dispose: () => { meshes.forEach(m => m.geometry.dispose()); material.dispose(); } };
}
function hitDistances(meshes: Mesh[], origin: number[], direction: number[], far = Infinity) {
 return new Raycaster(new Vector3(...origin), new Vector3(...direction), 0, far).intersectObjects(meshes).map(h => h.distance);
}
function closedSignedVolume(geometry: BufferGeometry) {
 const p = geometry.getAttribute('position'), indices = geometry.getIndex();
 const count = indices?.count ?? p.count, edges = new Map<string, number>();
 let volume = 0;
 const point = (i: number) => new Vector3().fromBufferAttribute(p, indices ? indices.getX(i) : i);
 const key = (v: Vector3) => v.toArray().map(x => x.toFixed(6)).join(',');
 for (let i = 0; i < count; i += 3) {
  const a = point(i), b = point(i + 1), c = point(i + 2);
  volume += a.dot(b.clone().cross(c)) / 6;
  for (const [u, v] of [[a, b], [b, c], [c, a]]) {
   const ku = key(u), kv = key(v), edge = [ku, kv].sort().join('|');
   edges.set(edge, (edges.get(edge) ?? 0) + (ku < kv ? 1 : -1));
  }
 }
 expect([...edges.values()].filter(v => v !== 0)).toEqual([]);
 expect(volume).toBeGreaterThan(0);
 return volume;
}

describe('independent unequal grid topology regression', () => {
 it('has no floor or ceiling in the omitted quadrant, while retaining both rooms', () => {
  const scene = meshesFor(rooms);
  expect(hitDistances(scene.meshes, [.7, 5, 5], [0, -1, 0])).toEqual([]);
  for (const [x,z] of [[.7,2],[2.5,2],[2.5,5]]) {
   const hits = hitDistances(scene.meshes, [x, 1.5, z], [0,-1,0]);
   expect(hits.length).toBeGreaterThan(0); expect(hits[0]).toBeCloseTo(1.4);
  }
  scene.dispose();
 });
 it('reclaims the merged divider and closes the two exposed notch boundaries', () => {
  const scene = meshesFor(rooms);
  expect(hitDistances(scene.meshes, [.2,1.5,2], [1,0,0], 3.2)).toEqual([]);
  const rear = hitDistances(scene.meshes, [.7,1.5,2], [0,0,1]);
  expect(rear[0]).toBeCloseTo(1.81);
  const notch = hitDistances(scene.meshes, [2.5,1.5,5], [-1,0,0]);
  expect(notch[0]).toBeCloseTo(.9);
  const shared = hitDistances(scene.meshes, [2.5,1.5,2], [0,0,1], 2.2);
  expect([...new Set(shared.map(v => v.toFixed(5)))]).toEqual(['1.81000','1.91000']);
  scene.dispose();
 });
 it('keeps exterior walls opaque from inside both logical rooms', () => {
  const doc = createSpatialDocument(rooms);
  for (const node of doc.renderNodes.filter(n => n.material.observable)) {
   const visibility = node.surfaceVisibility;
   const inverse = matrixFromTransform(visibility?.transform ?? node.transform).invert();
   const cameras = node.id.includes('#notch-back') ? [new Vector3(.7,1.5,2)] : node.id.includes('#notch-left') ? [new Vector3(2.5,1.5,5)] : [new Vector3(.7,1.5,2), new Vector3(2.5,1.5,5)];
   for (const camera of cameras) {
    expect(observableFrom(visibility?.observable ?? node.material.observable, camera, inverse), node.id).toBe(false);
   }
  }
 });
 it('clips mixed-boundary finishes without changing the authored face frame', () => {
  const doc = createSpatialDocument(rooms + '\n"Rooms/Finish/++/++/+0+1c":"cell: bedroom; surface: back; model: tile.glb"');
  expect(doc.diagnostics).toEqual([]);
  const finishes = doc.renderNodes.filter(n => n.model);
  expect(finishes).toHaveLength(2);
  expect(finishes[0].transform).toEqual(finishes[1].transform);
  const external = finishes.find(n => String(n.metadata?.attachedPanelId).includes('#notch-back'))!;
  const internal = finishes.find(n => String(n.metadata?.attachedPanelId).includes('#partition-grid'))!;
  expect(external).toBeDefined(); expect(internal).toBeDefined();
  expect(external.bounds.minX).toBeCloseTo(.1); expect(external.bounds.maxX).toBeCloseTo(1.55);
  expect(internal.bounds.minX).toBeCloseTo(1.55); expect(internal.bounds.maxX).toBeCloseTo(3.56);
  const camera = new Vector3(.7,1.5,5);
  for (const [node, hidden] of [[external,true],[internal,false]] as const) {
   const visibility = node.surfaceVisibility!;
   expect(observableFrom(visibility.observable, camera, matrixFromTransform(visibility.transform).invert())).toBe(hidden);
  }
 });
 it('masks direct enclosure floor finishes over omitted cells', () => {
  const scene = meshesFor(rooms + '\n"Rooms/Finish/++/++/+0+1c":"surface: bottom; color: red"');
  expect(hitDistances(scene.meshes,[.7,1.5,5],[0,-1,0])).toEqual([]);
  expect(hitDistances(scene.meshes,[2.5,1.5,5],[0,-1,0])[0]).toBeCloseTo(1.39);
  scene.dispose();
 });
 it('supports a three-dimensional central void surrounded by merged cuboids', () => {
  const source = '"Grid/+0+34d/+0+34d/+0+34d":"box-surface: 1d white; box-partition: 1d gray; box-grid: 3 3 3; box-grid-areas: front front front | front front front | front front front / bottom bottom bottom | left . right | top top top / back back back | back back back | back back back"';
  const scene = meshesFor(source);
  for (const axis of [0,1,2]) for (const sign of [-1,1]) {
   const direction = [0,0,0]; direction[axis] = sign;
   const hits = hitDistances(scene.meshes,[1.7,1.7,1.7],direction);
   expect(hits[0]).toBeCloseTo(.5);
  }
  for (const mesh of scene.meshes) closedSignedVolume(mesh.geometry);
  scene.dispose();
 });
 it('emits closed outward solids suitable for booleans', () => {
  const scene = meshesFor(rooms);
  const volume = scene.meshes.reduce((sum, mesh) => sum + closedSignedVolume(mesh.geometry), 0);
  const footprint = 3.66 * 3.91 + 2.16 * 2.31;
  const clearVolume = 3.46 * 3.1 * 3.71 + 1.96 * 3.1 * 2.21;
  expect(volume).toBeCloseTo(footprint * 3.3 - clearVolume, 5);
  scene.dispose();
 });
 it('cuts an opening through the shared room boundary without affecting the other side', () => {
  const scene = meshesFor(rooms + '\n"Opening/+18d+8d/+0+21d/+37d+4d":"operation: subtraction"');
  expect(hitDistances(scene.meshes,[2,1,3.5],[0,0,1],.8)).toEqual([]);
  expect(hitDistances(scene.meshes,[2.8,1,3.5],[0,0,1],.8).length).toBeGreaterThan(0);
  scene.dispose();
 });
});
