import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
const room = '"Room/+1+366c/+1+330c/+1+391c":"box-surface: 1d white; observable: true"';
const tile = '"Room/Tiles/+0+85c/+0+86c/+0+2c":"surface: walls; model: tile.glb; reset-axes: 90,0,0; repeat: x; repeat-gap: 1m; repeat-edge: clip"';
describe('surface attachments', () => {
 it('creates four correctly oriented clipped strips with shared wall visibility', () => {
  const doc = createSpatialDocument(`${room}\n${tile}`);
  expect(doc.diagnostics).toEqual([]);
  const tiles = doc.renderNodes.filter(n => n.model);
  expect(tiles).toHaveLength(20);
  expect(new Set(tiles.map(n => n.id)).size).toBe(20);
  expect(new Set(tiles.map(n => n.metadata?.attachedPanelId)).size).toBe(4);
  expect(tiles.every(n => n.surfaceVisibility?.observable && n.clippingPlanes?.length === 2)).toBe(true);
  for (const node of tiles) {
   expect(node.bounds.minX).toBeGreaterThanOrEqual(1.1 - 1e-8);
   expect(node.bounds.maxX).toBeLessThanOrEqual(4.56 + 1e-8);
   expect(node.bounds.minZ).toBeGreaterThanOrEqual(1.1 - 1e-8);
   expect(node.bounds.maxZ).toBeLessThanOrEqual(4.81 + 1e-8);
   expect(node.bounds.minY).toBeCloseTo(1.1);
   expect(node.bounds.maxY).toBeCloseTo(1.96);
  }
 });
 it('supports all faces, fills, and omitted panels', () => {
  const doc = createSpatialDocument(`${room}\n"Room/T/+0+/+0+/+0+1c":"surface: all"`);
  expect(doc.diagnostics).toEqual([]);
  expect(doc.renderNodes).toHaveLength(12);
  const missing = createSpatialDocument(`${room.replace('observable: true','box-surface-top: none')}\n"Room/T/+0+1/+0+1/+0+1c":"surface: top"`);
  expect(missing.diagnostics.some(d => d.message.includes('missing top'))).toBe(true);
  expect(missing.renderNodes).toHaveLength(5);
 });
 it.each(['sideways','left,left',''])('rejects invalid face selection %s', value => {
  const doc = createSpatialDocument(`${room}\n"Room/T/+0+1/+0+1/+0+1c":"surface: ${value}"`);
  expect(doc.diagnostics.length).toBeGreaterThan(0);
 });
 it('requires an enclosure and keeps ordinary children independent', () => {
  expect(createSpatialDocument('"T/+0+1/+0+1/+0+1":"surface: walls"').renderNodes).toHaveLength(0);
  const doc = createSpatialDocument(`${room}\n"Room/T/+0+1/+0+1/+0+1":""`);
  expect(doc.renderNodes.find(n => !n.metadata?.surfaceFace)?.surfaceVisibility).toBeUndefined();
 });
 it('copies nested attachments and their children through references', () => {
  const doc = createSpatialDocument(`${room}\n"Room/T/+0+1/+0+1/+0+1c":"surface: left"\n"Room/T/Detail/+0+1c/+0+1c/+0+1c":"color: red"\n"Copy/+6+4/+0+4/+0+4":"ref: Room; ref-scale: true"`);
  expect(doc.diagnostics).toEqual([]);
  expect(doc.renderNodes.filter(n => n.material.color === 'red')).toHaveLength(2);
 });
});
