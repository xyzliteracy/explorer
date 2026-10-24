import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import bedroomExample from '../../docs/examples/bedroom-grid.xyzdsl?raw';

const room = '"Rooms/+0+366c/+0+330c/+0+622c":"box-surface: 1d #fffdd0; box-partition: 1d #fffdd0; box-grid-columns: 140c 196c; box-grid-rows: 1; box-grid-slices: 371c 221c; box-grid-areas: bedroom bedroom / . annex; observable: true;"';
const item = (name: string, cell: string) => `"Rooms/${name}/++/++/++":"cell: ${cell}; model: item.glb;"`;

describe('unequal tracks and named cell layout', () => {
  it('compiles the complete documented bedroom migration', () => {
    const doc = createSpatialDocument(bedroomExample);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.renderNodes.some(n => n.model?.source === 'salouis/wooden_bed.glb')).toBe(true);
    expect(doc.csgExpressions.length).toBeGreaterThan(0);
  });
  it('preserves the bedroom and annex interior coordinates in one enclosure', () => {
    const doc = createSpatialDocument([room, item('Bedroom', 'bedroom'), item('Annex', 'annex')].join('\n'));
    expect(doc.diagnostics).toEqual([]);
    const models = doc.renderNodes.filter(n => n.model);
    expect(models).toHaveLength(2);
    expect(models[0].bounds).toEqual(expect.objectContaining({ minX: expect.closeTo(.1), minY: expect.closeTo(.1), minZ: expect.closeTo(.1), maxX: expect.closeTo(3.56), maxY: expect.closeTo(3.2), maxZ: expect.closeTo(3.81) }));
    expect(models[1].bounds).toEqual(expect.objectContaining({ minX: expect.closeTo(1.6), minY: expect.closeTo(.1), minZ: expect.closeTo(3.91), maxX: expect.closeTo(3.56), maxY: expect.closeTo(3.2), maxZ: expect.closeTo(6.12) }));
  });

  it('copies once per merged area and resolves either numeric bedroom cell to the same extent', () => {
    const doc = createSpatialDocument([room, item('All', 'all'), item('Numeric', '2 1 1')].join('\n'));
    expect(doc.diagnostics).toEqual([]);
    const models = doc.renderNodes.filter(n => n.model);
    expect(models).toHaveLength(3);
    expect(models.at(-1)!.bounds.maxX - models.at(-1)!.bounds.minX).toBeCloseTo(3.46);
    expect(new Set(models.map(n => n.id)).size).toBe(3);
  });

  it.each(['1 1 2', 'missing'])('rejects absent cell %s without losing the enclosure', cell => {
    const doc = createSpatialDocument([room, item('Bad', cell)].join('\n'));
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(doc.renderNodes.some(n => n.model)).toBe(false);
    expect(doc.renderNodes.length).toBeGreaterThan(0);
  });

  it('divides the remainder proportionally after fixed tracks and divider thickness', () => {
    const source = '"Rooms/+0+14d/+0+10d/+0+10d":"box-surface: 1d white; box-partition: 1d gray; box-grid-columns: 30c 1fr 2fr;"';
    const doc = createSpatialDocument([source, item('One', '1 1 1'), item('Two', '2 1 1'), item('Three', '3 1 1')].join('\n'));
    expect(doc.diagnostics).toEqual([]);
    const models = doc.renderNodes.filter(n => n.model);
    const widths = [.3, .7 / 3, 1.4 / 3];
    models.forEach((n, i) => expect(n.bounds.maxX - n.bounds.minX).toBeCloseTo(widths[i]));
    expect(models.at(-1)!.bounds.maxX).toBeCloseTo(1.3);
  });

  it('supports vertical merged areas and fractional rows', () => {
    const source = '"Rooms/+0+10d/+0+20d/+0+10d":"box-surface: 1d white; box-partition: 1d gray; box-grid-columns: 2; box-grid-rows: 1fr 2fr; box-grid-areas: tall low | tall high;"';
    const doc = createSpatialDocument([source, item('Tall', 'tall'), item('Low', 'low'), item('High', 'high')].join('\n'));
    expect(doc.diagnostics).toEqual([]);
    const models = doc.renderNodes.filter(n => n.model);
    expect(models[0].bounds.maxY - models[0].bounds.minY).toBeCloseTo(1.8);
    expect(models[1].bounds.maxY - models[1].bounds.minY).toBeCloseTo(1.7 / 3);
    expect(models[2].bounds.minY).toBeCloseTo(.2 + 1.7 / 3);
  });

  it('retains tracks and areas through scaled references exactly once', () => {
    const doc = createSpatialDocument([room, item('Bedroom', 'bedroom'), '"Copy/+10+732c/+0+660c/+0+1244c":"ref: Rooms; ref-scale: true;"'].join('\n'));
    expect(doc.diagnostics).toEqual([]);
    const copy = doc.renderNodes.find(n => n.model && n.namespacePath?.startsWith('Copy/'))!;
    expect(copy.bounds.minX).toBeCloseTo(10.2);
    expect(copy.bounds.maxX).toBeCloseTo(17.12);
    expect(copy.bounds.maxZ).toBeCloseTo(7.62);
  });

  it('clears a referenced area map without changing the source grid', () => {
    const doc = createSpatialDocument([room, item('Each', 'all'), '"Copy/+10+366c/+0+330c/+0+622c":"ref: Rooms; box-grid-areas: none;"'].join('\n'));
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes.filter(n => n.model && n.namespacePath?.startsWith('Rooms/'))).toHaveLength(2);
    expect(doc.renderNodes.filter(n => n.model && n.namespacePath?.startsWith('Copy/'))).toHaveLength(4);
  });

  it('lets a later count longhand replace explicit tracks on one axis', () => {
    const source = room.replace('box-grid-areas: bedroom bedroom / . annex;', 'box-grid-columns: 2; box-grid-areas: a b / . c;');
    const doc = createSpatialDocument([source, item('First', 'a')].join('\n'));
    expect(doc.diagnostics).toEqual([]);
    const first = doc.renderNodes.find(n => n.model)!;
    expect(first.bounds.maxX - first.bounds.minX).toBeCloseTo(1.68);
  });

  it('resolves an unequal child grid inside a merged area', () => {
    const doc = createSpatialDocument([room,
      '"Rooms/Shelf/++/+0+1d/+0+1d":"cell: bedroom; box-surface: 1m red; box-grid-columns: 1fr 2fr; box-partition: 1m blue;"',
      '"Rooms/Shelf/Item/++/++/++":"cell: all; model: small.glb;"',
    ].join('\n'));
    expect(doc.diagnostics).toEqual([]);
    const copies = doc.renderNodes.filter(n => n.model);
    expect(copies).toHaveLength(2);
    expect(copies[0].bounds.minX).toBeCloseTo(.101);
    expect(copies[1].bounds.maxX).toBeCloseTo(3.559);
    expect(copies[1].bounds.maxX - copies[1].bounds.minX).toBeCloseTo(2 * (copies[0].bounds.maxX - copies[0].bounds.minX));
  });

  it('bounds repeated area topology and releases rejected subtree reservations', () => {
    const row = Array(9).fill('room').join(' ');
    const slice = Array(9).fill(row).join(' | ');
    const areas = Array(9).fill(slice).join(' / ');
    const doc = createSpatialDocument([
      '"Parent/+0+2/+0+1/+0+1":""',
      `"Parent/Grid/+0+1/+0+1/+0+1":"box-surface: 1m white; box-partition: 1m gray; box-grid: 9 9 9; box-grid-areas: ${areas}; repeat: x;"`,
      room,
    ].join('\n'));
    expect(doc.diagnostics.some(d => d.message.includes('budget'))).toBe(true);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].namespacePath).toBe('Rooms/');
    expect(doc.renderNodes.length).toBeGreaterThan(0);
  });

  it('supports repeated finishes and routes door cuts to those models', () => {
    const doc = createSpatialDocument([room,
      '"Rooms/Tiles/+0+85c/+0+86c/+0+2c":"cell: bedroom; surface: walls; model: tile.glb; repeat: x; repeat-gap: 1m; repeat-edge: clip;"',
      '"Rooms/Floor/+0+67c/+0+67c/+0+1c":"cell: bedroom; surface: bottom; model: floor.glb; repeat: x,y; repeat-gap: 1m; repeat-edge: clip;"',
      '"Rooms/Door/+29c+88c/+0+205c/+369c+41c":"cell: bedroom; operation: subtraction;"',
    ].join('\n'));
    expect(doc.diagnostics).toEqual([]);
    expect(doc.renderNodes.filter(n => n.model?.source === 'floor.glb')).toHaveLength(36);
    expect(doc.renderNodes.some(n => n.model?.source === 'tile.glb' && n.modelCsgOperations?.length)).toBe(true);
    expect(doc.csgExpressions.length).toBeGreaterThan(0);
  });

  it.each([
    'box-grid-columns: 30c 20c', // Fixed tracks must fill the available clear space.
    'box-grid-columns: 90c 1fr',
    'box-grid-columns: 0fr 1fr',
    'box-grid-columns: -1fr 1fr',
    'box-grid-columns: 1fr NaNfr',
    'box-grid-columns: 2; box-grid-slices: 2; box-grid-areas: a a / a b',
    'box-grid-columns: 2; box-grid-slices: 2; box-grid-areas: a b / c',
    'box-grid-columns: 2; box-grid-areas: . .',
    'box-grid-columns: 2; box-grid-areas: all a',
  ])('rejects invalid grid atomically: %s', props => {
    const doc = createSpatialDocument(`"Rooms/+0+10d/+0+10d/+0+10d":"box-surface: 1d white; box-partition: 1d gray; ${props};"\n${item('Child', 'all')}`);
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(doc.renderNodes).toHaveLength(0);
  });
});
