// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Vector3 } from 'three';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { useObservableMesh } from './observability';
const state = vi.hoisted(() => ({ frame: undefined as undefined | ((value: any) => void) }));
vi.mock('@react-three/fiber', () => ({ useFrame: (frame: any) => { state.frame = frame; } }));
afterEach(cleanup);
it.each(['panel', 'csg', 'attachment'])('restores %s visibility on entering tours and cutaways on leaving', kind => {
 const doc = createSpatialDocument('"Sal/+0+366c/+0+330c/+0+391c":"box-surface: 1d white; observable: true"\n"Sal/Tile/+0+1/+0+1/+0+2c":"surface: back"\n"Cut/+1+1/+1+1/+37d+4d":"operation: subtraction"');
 const candidates = [...doc.renderNodes, ...doc.csgExpressions.map(e => e.base)];
 const node = kind === 'attachment' ? candidates.find(n=>n.metadata?.attachedPanelId)!
  : kind === 'csg' ? doc.csgExpressions.find(e=>e.base.metadata?.surfaceFace === 'back')!.base
  : candidates.find(n=>n.metadata?.surfaceFace === 'front')!;
 const view = renderHook(({tour})=>useObservableMesh(node,tour),{initialProps:{tour:false}});
 const mesh = new Mesh(); view.result.current.current = mesh;
 const camera = new PerspectiveCamera(); camera.position.copy(kind === 'panel' ? new Vector3(2,2,-1) : new Vector3(2,2,6));
 const frame = () => act(()=>state.frame!({camera}));
 frame();expect(mesh.visible).toBe(false);expect(mesh.userData.observableHidden).toBe(true);
 view.rerender({tour:true});frame();expect(mesh.visible).toBe(true);expect(mesh.userData.observableHidden).toBe(false);
 view.rerender({tour:false});frame();expect(mesh.visible).toBe(false);
});
