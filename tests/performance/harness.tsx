import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { _roots } from '@react-three/fiber';
import { SceneRoot } from '../../src/scene/SceneRoot';
import { SelectedModelAssetStore } from '../../src/performance/SelectedModelAssetStore';
import { ModelAssetStore } from '../../src/performance/ModelAssetStore';
import { modelScreenPixels } from '@xyz/viewer/performance/modelVisibility';
import { createSpatialDocument } from '../../src/model/createSpatialDocument';
const room = new URLSearchParams(location.search).get('scene') === 'lepapayer';
const source = (await (await fetch(room ? '/tests/fixtures/lepapayer.xyz' : '/performance-models/performance.xyz')).text()).replace(/(model(?:-preview|-detail)?:\s*)([^;"\s]+\.glb)/g, (_, prefix, file) => prefix + location.origin + (room ? '/' : '/performance-models/') + file);
const full = createSpatialDocument(source.replaceAll('.standard.glb', '.glb'));
if (!room) for (const node of full.renderNodes) if (node.model?.source) node.model.detailSource = node.model.source.replace('.glb', '.detail.glb');
const originals = new Set((new URLSearchParams(location.search).get('original') ?? '').split(','));
for (const node of full.renderNodes) if (node.model?.source && originals.has(node.model.source.split('/').pop()!.replace('.glb', ''))) node.model.detailSource = node.model.source;
if (full.diagnostics.length) throw Error(JSON.stringify(full.diagnostics));
const noop = () => {};
let assetStore;
let originalStore;
const acquire = ModelAssetStore.prototype.acquire;
ModelAssetStore.prototype.acquire = function (...args) { if (this instanceof SelectedModelAssetStore) originalStore = this; else assetStore = this; return acquire.apply(this, args); };
let setScene;
let selectNode;
let frames = 0;
let requests = [];
const presentations = () => {
  const result = [];
  state()?.scene.traverse(object => {
    if (!object.userData.model || !object.userData.spatialNodeId) return;
    let meshes = 0;
    let source;
    object.updateWorldMatrix(true, false);
    object.traverse(child => {
      if (child.userData.xyzAssetUrl) source = child.userData.xyzAssetUrl;
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      if (materials.some(material => material.opacity > 0)) meshes++;
    });
    result.push({ id: object.userData.spatialNodeId, meshes, source, pixels: modelScreenPixels(state().camera, object.matrixWorld, state().size.height) });
  });
  return result;
};
function App() {
  const [scene, change] = useState(full); setScene = change;
  const [selectedNodeId, select] = useState<string>(); selectNode = select;
  const [cameraMode, setCameraMode] = useState<'orbit' | 'pov'>('orbit');
  return <SceneRoot document={scene} selectedNodeId={selectedNodeId} onSelectNode={select} cameraMode={cameraMode} onCameraModeChange={setCameraMode} editorMode={false} selectedNodeCanEdit={false} editorLinearStep={.1} editorRotationStep={15} linearStepChoice="auto" onLinearStepChoiceChange={noop} onRotationStepChange={noop} onMoveNode={noop} onResizeNode={noop} onRotateNode={noop} onCreateNode={noop}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
const state = () => [..._roots.values()][0]?.store.getState();
const interval = setInterval(() => {
  const root = state(); if (!root) return;
  const render = root.gl.render.bind(root.gl);
  root.gl.render = (...args) => { frames++; return render(...args); };
  root.camera.position.set(4.5, 5, 13); root.camera.lookAt(4.5, .5, 1.5); if (root.controls) { root.controls.target.set(4.5, .5, 1.5); root.controls.update(); } root.invalidate();
  clearInterval(interval);
}, 20);
(window as any).performanceTest = {
  snapshot: () => {
    const root = state();
    return root ? { assets: assetStore?.status(), original: originalStore?.status(), camera: root.camera.position.toArray(), controls: root.controls?.target?.toArray(), frames, calls: root.gl.info.render.calls, triangles: root.gl.info.render.triangles, textures: root.gl.info.memory.textures, geometries: root.gl.info.memory.geometries, dpr: root.viewport.dpr, frameloop: root.frameloop, presentations: presentations(), requests } : null;
  },
  camera: (position, target) => { const root = state(); root.camera.position.set(...position); root.camera.lookAt(...target); if (root.controls) { root.controls.target.set(...target); root.controls.update(); } root.invalidate(); },
  clear: () => setScene({ ...full, nodes: [], renderNodes: [] }),
  restore: () => setScene(full),
  only: (index) => setScene({ ...full, nodes: [full.nodes[index]], renderNodes: [full.renderNodes[index]] }),
  // Pin all slots when testing a single level so inference cannot upgrade it.
  level: (level, index) => setScene({
    ...full,
    renderNodes: full.renderNodes.filter((_, i) => index === undefined || i === index).map(node => {
      const source = node.model.source.replace('.standard.glb', `.${level}.glb`);
      return { ...node, model: { ...node.model, source, previewSource: source, detailSource: source } };
    }),
  }),
  select: (index) => selectNode(index === undefined ? undefined : full.renderNodes[index].id),
  full,
};
