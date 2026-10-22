import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide, Float32BufferAttribute, Int16BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute } from 'three';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { cutModelInstance } from './modelCsg';
import { matrixFromTransform } from '../model/transform';
import { installClippedRaycast } from './clipping';
import { sweptSphereIntersectsScene } from './povCollision';

describe('repeated model CSG', () => {
 it.each([false, true])('preserves quantized repeated tiles outside the cut (interleaved=%s)', interleaved => {
  const doc = createSpatialDocument('"Row/+2+2/+0+1/+3+1":""\n"Row/Tile/+0+1/+0+1/+0+1":"model: tile.glb; repeat: x"\n"Cut/+19d+22d/+4d+2d/+29d+12d":"operation: subtraction"');
  const geometry = new BoxGeometry();
  for (const name of ['position', 'normal', 'uv']) {
   const source = geometry.getAttribute(name);
   const packed = new Int16BufferAttribute(Array.from(source.array, v => Math.round(v * 32767)), source.itemSize, true);
   if (interleaved) {
    const stride = source.itemSize + 1;
    const values = new Int16Array(source.count * stride).fill(123);
    for (let i = 0; i < source.count; i++) for (let c = 0; c < source.itemSize; c++) values[i * stride + c + 1] = packed.array[i * source.itemSize + c];
    geometry.setAttribute(name, new InterleavedBufferAttribute(new InterleavedBuffer(values, stride), source.itemSize, 1, true));
   } else geometry.setAttribute(name, packed);
  }
  const original = geometry.attributes.position.array.slice();
  const asset = new Group(); const material = new MeshBasicMaterial({side:DoubleSide}); asset.add(new Mesh(geometry,material));
  for (const node of doc.renderNodes.filter(n => n.model)) {
   const cut = cutModelInstance(asset,node,{position:[0,0,0],scale:[1,1,1]});
   cut.scene.applyMatrix4(matrixFromTransform(node.transform)); cut.scene.updateMatrixWorld(true);
   const x = node.bounds.minX + .5;
   expect(new Raycaster(new Vector3(x,.2,5),new Vector3(0,0,-1)).intersectObject(cut.scene,true).length).toBeGreaterThan(0);
   expect(new Raycaster(new Vector3(x,.5,5),new Vector3(0,0,-1)).intersectObject(cut.scene,true)).toHaveLength(0);
   const mesh = cut.scene.children[0] as Mesh;
   expect(mesh.geometry.attributes.position.array).toBeInstanceOf(Float32Array);
   expect(mesh.geometry.attributes.uv.normalized).toBe(false);
   expect(mesh.geometry.attributes.normal.normalized).toBe(false);
   const uv = mesh.geometry.attributes.uv;
   expect(Math.min(...uv.array)).toBeGreaterThanOrEqual(0);
   expect(Math.max(...uv.array)).toBeLessThanOrEqual(1);
   cut.dispose();
  }
  expect(geometry.attributes.position.array).toEqual(original);
  geometry.dispose(); material.dispose();
 });

 it('cuts all overlapping repeated models, without modifying the shared asset', () => {
  const doc = createSpatialDocument('"Row/+0+3/+0+1/+0+1":""\n"Row/Tile/+0+1/+0+1/+0+1":"model: tile.glb; repeat: x"\n"Cut/+0+3/+4d+2d/+0+1":"operation: subtraction"');
  expect(doc.diagnostics).toEqual([]);
  const nodes = doc.renderNodes.filter(n => n.model);
  expect(nodes).toHaveLength(3);
  expect(nodes.every(n => n.modelCsgOperations?.length === 1)).toBe(true);
  const asset = new Group(); const geometry = new BoxGeometry(1,1,1); const material = new MeshBasicMaterial({side:DoubleSide});
  asset.add(new Mesh(geometry, material));
  const original = geometry.attributes.position.array.slice();
  for (const node of nodes) {
   const cut = cutModelInstance(asset, node, {position:[0,0,0],scale:[1,1,1]});
   cut.scene.applyMatrix4(matrixFromTransform(node.transform)); cut.scene.updateMatrixWorld(true);
   const x = node.bounds.minX + .5;
   expect(new Raycaster(new Vector3(x,.5,2),new Vector3(0,0,-1)).intersectObject(cut.scene,true)).toHaveLength(0);
   expect(new Raycaster(new Vector3(x,.2,2),new Vector3(0,0,-1)).intersectObject(cut.scene,true).length).toBeGreaterThan(0);
   expect(sweptSphereIntersectsScene(cut.scene,new Vector3(x,.5,2),new Vector3(x,.5,-1),.05)).toBe(false);
   cut.dispose();
  }
  expect(geometry.attributes.position.array).toEqual(original);
  geometry.dispose();material.dispose();
 });
 it('cuts a wall and its repeated attached tiles with one primitive tool', () => {
  const doc = createSpatialDocument('"Room/+1+4/+1+4/+1+4":"box-surface: 1d white"\n"Room/T/+0+1/+0+1/+0+2c":"surface: front; model: tile.glb; repeat: x"\n"Window/+12d+3/+12d+5d/+9d+3d":"operation: subtraction"');
  expect(doc.diagnostics).toEqual([]);
  expect(doc.csgExpressions).toHaveLength(1);
  expect(doc.csgExpressions[0].base.metadata?.surfaceFace).toBe('front');
  expect(doc.renderNodes.filter(n=>n.model).every(n=>n.modelCsgOperations?.length === 1)).toBe(true);
 });
 it('fans out primitive cuts across repetitions and supports repeated cutters', () => {
  const doc = createSpatialDocument('"Row/+0+3/+0+1/+0+1":""\n"Row/Tile/+0+1/+0+1/+0+1":"repeat: x"\n"Row/Cut/+0+1/+4d+2d/+0+1":"operation: subtraction; repeat: x"');
  expect(doc.diagnostics).toEqual([]);
  expect(doc.csgExpressions).toHaveLength(3);
  expect(doc.renderNodes).toHaveLength(0);
 });
 it('hidden attached-model ancestors suppress selection rays without changing collision', () => {
  const mesh = new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());
  mesh.userData.spatialNodeId = 'attached';
  const group = new Group();group.add(mesh);group.updateMatrixWorld(true);
  installClippedRaycast(mesh);
  const ray = new Raycaster(new Vector3(0,0,2), new Vector3(0,0,-1));
  expect(ray.intersectObject(group,true).length).toBeGreaterThan(0);
  group.userData.observableHidden = true;group.visible = false;
  expect(ray.intersectObject(group,true)).toHaveLength(0);
  expect(sweptSphereIntersectsScene(group,new Vector3(0,0,2),new Vector3(0,0,-2),.1)).toBe(true);
 });
 it('accepts untextured meshes without UVs and preserves multiple material groups', () => {
  const doc = createSpatialDocument('"M/+0+1/+0+1/+0+1":"model: m.glb"\n"Cut/+2d+5d/+2d+5d/+0+1":"operation: subtraction"');
  const asset = new Group(); const geometry = new BoxGeometry(); geometry.deleteAttribute('uv'); geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(.5), 3));
  const materials = Array.from({length:6}, (_,i)=>new MeshBasicMaterial({color:i*1000}));
  asset.add(new Mesh(geometry,materials));
  const result = cutModelInstance(asset,doc.renderNodes[0],{position:[0,0,0],scale:[1,1,1]});
  const mesh = result.scene.children[0] as Mesh;
  expect(mesh.geometry.attributes.uv).toBeDefined();
  expect(mesh.geometry.attributes.color).toBeDefined();
  expect(mesh.geometry.groups.length).toBeGreaterThan(0);
  expect(geometry.attributes.uv).toBeUndefined();
  result.dispose();geometry.dispose();materials.forEach(m=>m.dispose());
 });

});
