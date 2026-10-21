import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Matrix4, Mesh, Raycaster, Vector3 } from 'three';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { observableFrom, observableRaycast } from './observability';
import { sweptSphereIntersectsScene } from './povCollision';
import { parseObjectProperties } from '../xyzdsl/objectDeclarationParser';

describe('one-way observability', () => {
  it.each(['+x', '-x', '+y', '-y', '+z', '-z'] as const)('validates and observes %s from only its named side', value => {
    expect(parseObjectProperties(`observable: ${value}`).material.observable).toBe(value);
    const camera = new Vector3();
    camera[value[1] as 'x' | 'y' | 'z'] = value[0] === '+' ? 2 : -2;
    expect(observableFrom(value, camera, new Matrix4())).toBe(true);
    expect(observableFrom(value, camera.negate(), new Matrix4())).toBe(false);
    expect(observableFrom(value, new Vector3(), new Matrix4())).toBe(false);
  });
  it('normalizes booleans, rejects invalid values, and defaults to opaque', () => {
    expect(parseObjectProperties('observable: true').material.observable).toBe('+z');
    expect(parseObjectProperties('observable: false').material.observable).toBe(false);
    expect(parseObjectProperties('observable: sideways').diagnostics.join()).toContain('observable must be');
    expect(observableFrom(undefined, new Vector3(0, 0, 2), new Matrix4())).toBe(false);
    expect(observableFrom(false, new Vector3(0, 0, 2), new Matrix4())).toBe(false);
  });
  it('inherits through namespaces and references with explicit false overrides', () => {
    const document = createSpatialDocument(`"Wall" : "observable: -x"
"Wall/+0+2/+0+2/+0+1" : ""
"Copy/+4+2/+0+2/+0+1" : "ref: Wall/"
"Solid/+8+2/+0+2/+0+1" : "ref: Wall/; observable: false"`);
    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes.map(n => n.material.observable)).toEqual(['-x', '-x', false]);
  });
  it('uses a translated, rotated, scaled local center plane', () => {
    const world = new Matrix4().makeTranslation(5, 2, 3)
      .multiply(new Matrix4().makeRotationY(Math.PI / 2)).scale(new Vector3(2, 3, 4));
    const inverse = world.clone().invert();
    expect(observableFrom('+z', new Vector3(10, 2, 3), inverse)).toBe(true);
    expect(observableFrom('+z', new Vector3(0, 2, 3), inverse)).toBe(false);
  });
  it('lets rays pass through a hidden block but retains physical collision', () => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 1));
    mesh.userData.spatialNodeId = 'wall';
    mesh.raycast = observableRaycast;
    const scene = new Group(); scene.add(mesh); scene.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0, 0, 2), new Vector3(0, 0, -1));
    expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
    mesh.visible = false; mesh.userData.observableHidden = true;
    expect(ray.intersectObject(mesh)).toEqual([]);
    expect(sweptSphereIntersectsScene(scene, new Vector3(0, 0, 2), new Vector3(0, 0, -2), .1)).toBe(true);
    expect(sweptSphereIntersectsScene(scene, new Vector3(0, 0, -2), new Vector3(0, 0, 2), .1)).toBe(true);
    mesh.visible = true;
    expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  });
});
