import { Box3, BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { reorientModel } from './modelReorientation';
import { modelFitTransformFromBounds } from './modelFit';
import { createSpatialDocument } from '../model/createSpatialDocument';

it('reorients an offset rug before fitting and places its bottom at ground level', () => {
  const source = new Mesh(new BoxGeometry(2, 3, 0.02));
  source.position.set(4, 5, 6);
  source.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(source);
  const oriented = reorientModel(source.clone(), bounds, [Math.PI / 2, 0, 0]);
  expect(oriented.bounds.getSize(new Vector3()).y).toBeCloseTo(0.02);
  const fit = modelFitTransformFromBounds(oriented.bounds, 'contain', 'floor', [2, 0.1, 3]);
  const placement = new Group();
  placement.position.y = 0.05;
  placement.scale.set(2, 0.1, 3);
  const fitted = new Group();
  fitted.scale.set(...fit.scale);
  const offset = new Group();
  offset.position.set(...fit.position);
  offset.add(oriented.scene);
  fitted.add(offset);
  placement.add(fitted);
  expect(new Box3().setFromObject(placement).min.y).toBeCloseTo(0, 10);
  expect(source.parent).toBeNull();
  expect(source.rotation.x).toBe(0);
  expect(bounds.getSize(new Vector3()).z).toBeCloseTo(0.02);
});

it('inherits reorientation and allows an explicit zero override independently of scene rotation', () => {
  const document = createSpatialDocument(`"Rug/" : "model: rug.glb; reset-axes: 90, 0, 0"
"Rug/+0+2/+0+1d/+0+3" : "model-align: floor; rotation: 0, 45, 0"`);
  expect(document.diagnostics).toEqual([]);
  expect(document.renderNodes[0].model?.reorientation).toEqual([Math.PI / 2, 0, 0]);
  expect(document.renderNodes[0].transform.rotation[1]).toBeCloseTo(Math.PI / 4);
  const overridden = createSpatialDocument(`"Rug/" : "model: rug.glb; reset-axes: 90, 0, 0"
"Rug/+0+2/+0+1d/+0+3" : "reset-axes: 0, 0, 0"`);
  expect(overridden.diagnostics).toEqual([]);
  expect(overridden.renderNodes[0].model?.reorientation).toEqual([0, 0, 0]);
});

it.each(['90, 0', '90,,0', '90, 0, Infinity', 'NaN, 0, 0', '90, 0, 0, 0'])(
  'rejects invalid model reorientation %s', value => {
    const document = createSpatialDocument(`"Rug/+0+2/+0+1d/+0+3" : "model: rug.glb; reset-axes: ${value}"`);
    expect(document.diagnostics.some(diagnostic => diagnostic.message.includes('reset-axes'))).toBe(true);
  },
);
