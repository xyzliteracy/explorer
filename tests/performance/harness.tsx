import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { _roots } from '@react-three/fiber';
import { SceneRoot } from '../../src/scene/SceneRoot';
import { ModelAssetStore } from '../../src/performance/ModelAssetStore';
import { createSpatialDocument } from '../../src/model/createSpatialDocument';
const source = (await (await fetch('/performance-models/performance.xyz')).text()).replace(/(model(?:-preview|-detail)?:\s*)([^;"\s]+\.glb)/g, (_, prefix, file) => prefix + location.origin + '/performance-models/' + file);
const full = createSpatialDocument(source);
if (full.diagnostics.length) throw Error(JSON.stringify(full.diagnostics));
const noop = () => {};
let assetStore;
const acquire = ModelAssetStore.prototype.acquire;
ModelAssetStore.prototype.acquire = function (...args) { assetStore = this; return acquire.apply(this, args); };
let setScene;
let frames = 0;
let requests = [];
function App() {
  const [scene, change] = useState(full); setScene = change;
  const [cameraMode, setCameraMode] = useState<'orbit' | 'pov'>('orbit');
  return <SceneRoot document={scene} cameraMode={cameraMode} onCameraModeChange={setCameraMode} editorMode={false} selectedNodeCanEdit={false} editorLinearStep={.1} editorRotationStep={15} linearStepChoice="auto" onLinearStepChoiceChange={noop} onRotationStepChange={noop} onMoveNode={noop} onResizeNode={noop} onRotateNode={noop} onCreateNode={noop}/>;
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
    return root ? { assets: assetStore?.status(), camera: root.camera.position.toArray(), controls: root.controls?.target?.toArray(), frames, calls: root.gl.info.render.calls, triangles: root.gl.info.render.triangles, textures: root.gl.info.memory.textures, geometries: root.gl.info.memory.geometries, dpr: root.viewport.dpr, frameloop: root.frameloop, requests } : null;
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
  full,
};
