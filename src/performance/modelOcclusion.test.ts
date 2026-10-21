import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, DoubleSide, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import { modelOccluded } from './modelOcclusion';
function setup(width = 4) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, .01, 100);
  camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const wall = new Mesh(new BoxGeometry(width, 4, .1), new MeshStandardMaterial({ side: DoubleSide }));
  wall.userData.geometry = 'box'; wall.position.z = 1; scene.add(wall);
  return { scene, camera, wall, model: new Matrix4().makeTranslation(0, 0, -1) };
}
describe('conservative wall occlusion', () => {
  it('proves the complete model box hidden behind one solid face', () => {
    const { camera, scene, model } = setup();
    expect(modelOccluded(camera, scene, model, 0)).toBe(true);
  });
  it('keeps partial visibility and models on the near side of a wall', () => {
    const { camera, scene, model } = setup(.1);
    expect(modelOccluded(camera, scene, model, 0)).toBe(false);
    const full = setup();
    expect(modelOccluded(full.camera, full.scene, new Matrix4().makeTranslation(0, 0, 2), 0)).toBe(false);
  });
  it.each(['transparent', 'cutout', 'model', 'hidden', 'invisible-material', 'alpha', 'layer', 'near-clipped'])('does not use a %s surface as a proof', kind => {
    const { camera, scene, wall, model } = setup();
    if (kind === 'transparent') wall.material.transparent = true;
    if (kind === 'cutout') (wall as Mesh<BufferGeometry>).geometry = new BufferGeometry().copy(wall.geometry);
    if (kind === 'model') wall.userData.model = 'door.glb';
    if (kind === 'hidden') wall.visible = false;
    if (kind === 'invisible-material') wall.material.visible = false;
    if (kind === 'alpha') wall.material.alphaTest = .5;
    if (kind === 'layer') wall.layers.set(1);
    if (kind === 'near-clipped') camera.near = 3.5;
    expect(modelOccluded(camera, scene, model, 0)).toBe(false);
  });
});
