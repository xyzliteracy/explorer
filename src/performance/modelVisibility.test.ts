import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { cameraFacesModel, chooseModelTier, modelScreenPixels } from './modelVisibility';
describe('camera-aware level of detail', () => {
  it('ignores objects behind the camera and increases detail as they approach', () => {
    const camera = new PerspectiveCamera(60, 1, .01, 1000);
    expect(modelScreenPixels(camera, new Matrix4().makeTranslation(0, 0, 5), 800)).toBe(0);
    const far = modelScreenPixels(camera, new Matrix4().makeTranslation(0, 0, -20), 800);
    const near = modelScreenPixels(camera, new Matrix4().makeTranslation(0, 0, -3), 800);
    expect(near).toBeGreaterThan(far);
    expect(modelScreenPixels(camera, new Matrix4().makeTranslation(100, 0, -5), 800)).toBe(0);
  });
  it('focuses fitted boundaries including rotated models and rejects side/behind models', () => {
    const camera = new PerspectiveCamera(60, 1, .01, 1000);
    expect(cameraFacesModel(camera, new Matrix4().makeTranslation(0, 0, -5))).toBe(true);
    expect(cameraFacesModel(camera, new Matrix4().makeTranslation(2, 0, -5))).toBe(false);
    expect(cameraFacesModel(camera, new Matrix4().makeTranslation(0, 0, 5))).toBe(false);
    const rotated = new Matrix4().makeRotationY(Math.PI / 4).scale(new Vector3(3, 1, 1)).setPosition(0, 0, -5);
    expect(cameraFacesModel(camera, rotated)).toBe(true);
    camera.lookAt(2, 0, -5);
    expect(cameraFacesModel(camera, new Matrix4().makeTranslation(2, 0, -5))).toBe(true);
    expect(cameraFacesModel(camera, new Matrix4().makeScale(0, 1, 1))).toBe(false);
  });
  it('uses hysteresis instead of oscillating around thresholds', () => {
    expect(chooseModelTier(150, 'preview')).toBe('preview');
    expect(chooseModelTier(150, 'standard')).toBe('standard');
    expect(chooseModelTier(450, 'standard')).toBe('standard');
    expect(chooseModelTier(450, 'detail')).toBe('detail');
    expect(chooseModelTier(0, 'detail')).toBe('none');
  });
});
