import defaultDraft from '../defaultDraft.xyzdsl?raw';
import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { lightNodes, lightingBounds, pointShadowSettings } from './Lighting';
import { materialParameters } from './SpatialPrimitive';
import { PERFORMANCE_CANVAS } from '../performance/ModelRuntime';

describe('spatial lights and enclosure lighting', () => {
  it('positions a non-solid point source at its box center under a transformed parent', () => {
    const doc = createSpatialDocument(`"room/+10+4/+0+4/+0+4" : "rotation: 0, 90, 0"
"room/lamp/+1+2/+1+2/+1+2" : "light-source: true; light-intensity: 12; light-color: orange; light-distance: 8"`);
    expect(doc.diagnostics).toEqual([]);
    const [light] = lightNodes(doc);
    expect(light.light).toEqual({ intensity: 12, color: 'orange', distance: 8 });
    expect(light.transform.position[0]).toBeCloseTo(12);
    expect(light.transform.position[1]).toBeCloseTo(2);
    expect(light.transform.position[2]).toBeCloseTo(-2);
    expect(light.renderable).toBe(false);
    expect(doc.renderNodes.some(node => node.id === light.id)).toBe(false);
    expect(doc.csgExpressions).toEqual([]);
  });
  it('materializes lights inside a referenced subtree without solid light boxes', () => {
    const doc = createSpatialDocument(`"fixture" : ""
"fixture/lamp/+0+2/+0+2/+0+2" : "light-source: point"
"copy/+10+4/+0+4/+0+4" : "ref: fixture"`);
    expect(doc.diagnostics).toEqual([]);
    expect(lightNodes(doc)).toHaveLength(1);
    expect(lightNodes(doc)[0].transform.position).toEqual([11, 1, 1]);
    expect(doc.renderNodes).toHaveLength(0);
  });
  it('diagnoses invalid options and accepts a disabled source', () => {
    const doc = createSpatialDocument('"+0+1/+0+1/+0+1" : "light-source: true; light-intensity: -1; light-distance: NaN"');
    expect(doc.diagnostics).toHaveLength(2);
    expect(lightNodes(doc)[0].light?.intensity).toBe(10);
    expect(lightNodes(createSpatialDocument('"+0+1/+0+1/+0+1" : "light-source: false"'))).toEqual([]);
  });
  it('fits translated large geometry and tiny geometry instead of a fixed shadow volume', () => {
    const large = lightingBounds(createSpatialDocument('"+100+20/+200+40/+300+60" : "geometry: box"'));
    expect(large.center).toEqual([110, 220, 330]);
    expect(large.radius).toBeGreaterThan(Math.hypot(20, 40, 60) / 2);
    const tiny = lightingBounds(createSpatialDocument('"+0+1m/+0+1m/+0+1m" : "geometry: box"'));
    expect(tiny.radius).toBeLessThan(0.01);
  });
  it('enables renderer shadows and does not make overlapping solids self-emissive', () => {
    expect(PERFORMANCE_CANVAS.shadows).toBe(true);
    const doc = createSpatialDocument('"+0+1/+0+1/+0+1" : "geometry: box"');
    expect(materialParameters({ ...doc.renderNodes[0], unionGroupId: 'union' }).emissive).toBeUndefined();
  });
});


describe('point-shadow precision', () => {
  it('uses small scene-unit offsets capped by thin declared walls', () => {
    const doc = createSpatialDocument('"+0+10/+0+3/+0+1c" : "color: white"');
    const settings = pointShadowSettings(doc, [5, 2, 2]);
    const offset = -settings.bias * (settings.far - settings.near);
    expect(offset).toBeGreaterThan(0);
    expect(offset + settings.normalBias).toBeLessThanOrEqual(0.004);
    expect(settings.normalBias).toBeGreaterThan(0);
  });
  it('fits every scene corner from translated lights and shrinks offsets for tiny scenes', () => {
    const doc = createSpatialDocument('"+100+2/+200+2/+300+2" : "color: white"');
    const position = [110, 210, 310];
    const settings = pointShadowSettings(doc, position);
    for (const x of [100, 102]) for (const y of [200, 202]) for (const z of [300, 302]) {
      expect(settings.far).toBeGreaterThan(Math.hypot(x-position[0], y-position[1], z-position[2]));
    }
    const tiny = pointShadowSettings(createSpatialDocument('"+0+1m/+0+1m/+0+1m" : ""'), [.002,.002,.002]);
    expect(tiny.normalBias).toBeLessThan(0.00001);
    expect(tiny.far).toBeGreaterThan(tiny.near);
  });
});

it('ships the Pap default draft with four explicit lights and six viewpoints', () => {
  const document = createSpatialDocument(defaultDraft);
  expect(document.diagnostics).toEqual([]);
  const lights = lightNodes(document);
  expect(lights).toHaveLength(4);
  for (const light of lights) {
    expect(light.light).toEqual({ color: '#ffffff', intensity: 10, distance: 0 });
  }
  expect(document.nodes.filter(node => node.metadata?.viewPoint)).toHaveLength(6);
});
