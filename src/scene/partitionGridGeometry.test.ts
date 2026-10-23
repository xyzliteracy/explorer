import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { partitionGridGeometry } from './partitionGridGeometry';
import { gridLayout, type Triple } from '../xyzdsl/boxGrid';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { evaluateCsgExpressionGeometry } from './csgGeometry';
import { sweptSphereIntersectsScene } from './povCollision';

describe('shared grid solid', () => {
 it.each<Triple>([[2,2,2],[3,4,2],[1,4,1],[3,1,2]])('has outward closed faces and correct union volume for %s %s %s', (x,y,z) => {
  const layout = gridLayout({counts:[x,y,z],partition:{thickness:.1,color:'white'}},[2,3,4],[0,0,0])!;
  const geometry = partitionGridGeometry(layout);
  const positions = geometry.attributes.position, index = geometry.index!;
  const edges = new Map<string, number>();
  let volume = 0;
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const key = (v: Vector3) => v.toArray().map(n=>n.toFixed(7)).join(',');
  for(let i=0;i<index.count;i+=3) {
   a.fromBufferAttribute(positions,index.getX(i)); b.fromBufferAttribute(positions,index.getX(i+1)); c.fromBufferAttribute(positions,index.getX(i+2));
   volume += a.dot(b.clone().cross(c))/6;
   for(const [u,v] of [[a,b],[b,c],[c,a]]) {
    const ku=key(u),kv=key(v),pair=[ku,kv].sort().join('|');
    edges.set(pair,(edges.get(pair)??0)+(ku<kv?1:-1));
   }
  }
  expect([...edges.values()].every(n=>n===0)).toBe(true);
  const clearVolume = layout.cellSize.reduce((n,v)=>n*v,1)*x*y*z;
  expect(volume).toBeCloseTo((24-clearVolume)/24,6);
  // Every triangle is on the boundary, not an internal junction face.
  for(let i=0;i<index.count;i+=3){
   a.fromBufferAttribute(positions,index.getX(i));b.fromBufferAttribute(positions,index.getX(i+1));c.fromBufferAttribute(positions,index.getX(i+2));
   const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
   const midpoint=a.clone().add(b).add(c).divideScalar(3);
   const occupied=(p:Vector3)=>p.toArray().every(v=>v>=-.5&&v<=.5)&&p.toArray().some((v,axis)=>{
    const q=(v+.5)*layout.size[axis];
    for(let n=1;n<layout.counts[axis];n++){const start=n*layout.cellSize[axis]+(n-1)*layout.thickness;if(q>start&&q<start+layout.thickness)return true;}
    return false;
   });
   expect(occupied(midpoint.clone().addScaledVector(normal,-1e-5))).toBe(true);
   expect(occupied(midpoint.clone().addScaledVector(normal,1e-5))).toBe(false);
  }
  geometry.dispose();
 });
 it('cuts partition junctions and uses the cut geometry for picking and collision', () => {
  const doc=createSpatialDocument('"Room/+0+22d/+0+22d/+0+22d":"box-surface: 1d white; box-grid: 2 2 2; box-partition: 1d gray"\n"Cut/+0+22d/+3d+4d/+3d+4d":"operation: subtraction"');
  expect(doc.diagnostics).toEqual([]);
  const expression=doc.csgExpressions.find(e=>e.base.geometry.partitionGrid)!;
  const geometry=evaluateCsgExpressionGeometry(expression);
  const material=new MeshBasicMaterial();const mesh=new Mesh(geometry,material);mesh.userData.spatialNodeId=expression.base.id;mesh.updateMatrixWorld(true);
  expect(new Raycaster(new Vector3(0,.5,.5),new Vector3(1,0,0)).intersectObject(mesh)).toHaveLength(0);
  expect(new Raycaster(new Vector3(0,.8,.5),new Vector3(1,0,0)).intersectObject(mesh).length).toBeGreaterThan(0);
  expect(sweptSphereIntersectsScene(mesh,new Vector3(.5,.5,.5),new Vector3(1.5,.5,.5),.05)).toBe(false);
  expect(sweptSphereIntersectsScene(mesh,new Vector3(.5,.8,.5),new Vector3(1.5,.8,.5),.05)).toBe(true);
  geometry.dispose();material.dispose();
 });
});
