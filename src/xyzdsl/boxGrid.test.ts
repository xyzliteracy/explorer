import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { findNodeByLineNumber, selectionTargetForNodeId } from '../selection';

const cabinet = '"Cabinet/+0+12d/+0+18d/+0+4d":"box-surface: 2c white; box-grid: 3 4 2; box-partition: 1c gray; observable: true"';
const flatten = (nodes: SpatialNode[]): SpatialNode[] => nodes.flatMap(n => [n, ...flatten(n.children ?? [])]);
const scene = (extra = '', base = cabinet) => createSpatialDocument(base + '\n' + extra);

describe('box grid layout', () => {
 it('generates one shared partition solid with clear cell dimensions', () => {
  const doc = scene(); expect(doc.diagnostics).toEqual([]);
  expect(doc.renderNodes).toHaveLength(7);
  const grid = doc.renderNodes.find(n => n.geometry.partitionGrid)!;
  expect(grid.geometry.partitionGrid!.counts).toEqual([3,4,2]);
  grid.geometry.partitionGrid!.cellSize.forEach((v,i) => expect(v).toBeCloseTo([.38,.4325,.175][i]));
  expect(grid.material.observable).toBe(false);
  expect(grid.material.color).toBe('gray');
  expect(selectionTargetForNodeId(doc.nodes,grid.id)?.id).toBe(doc.nodes[0].id);
 });
 it('places a selected cell child inside the panels and leaves ordinary children unchanged', () => {
  const doc = scene('"Cabinet/Item/++/++/++":"cell: 2 3 1; color: red"\n"Cabinet/Ordinary/+0+1c/+0+1c/+0+1c":""');
  expect(doc.diagnostics).toEqual([]);
  const item = doc.renderNodes.find(n => n.material.color === 'red')!;
  expect(selectionTargetForNodeId(doc.nodes,item.id)?.id).toBe(item.id);
  expect(findNodeByLineNumber(doc.nodes,2)?.id).toBe(item.id);
  expect(item.bounds.minX).toBeCloseTo(.41); expect(item.bounds.minY).toBeCloseTo(.905); expect(item.bounds.minZ).toBeCloseTo(.02);
  item.geometry.dimensions.forEach((v,i)=>expect(v).toBeCloseTo([.38,.4325,.175][i]));
  const ordinary = doc.renderNodes.find(n => n.namespacePath?.includes('Ordinary'))!;
  expect(ordinary.bounds.minX).toBeCloseTo(.02); expect(ordinary.bounds.minY).toBeCloseTo(.02);
 });
 it('copies children and descendants for every cell with unique identities', () => {
  const doc = scene('"Cabinet/Item/+0+1c/+0+1c/+0+1c":"cell: all; model: item.glb"\n"Cabinet/Item/Detail/+0+1m/+0+1m/+0+1m":"color: red"');
  expect(doc.diagnostics).toEqual([]);
  expect(doc.renderNodes.filter(n => n.model)).toHaveLength(24);
  expect(doc.renderNodes.filter(n => n.material.color === 'red')).toHaveLength(24);
  const nodes = flatten(doc.nodes); expect(new Set(nodes.map(n => n.id)).size).toBe(nodes.length);
 });
 it('supports cell far edges and clipped repeats', () => {
  const doc = scene('"Cabinet/Item/++5c/+0+1d/+0+1c":"cell: 2 3 1; repeat: y; repeat-edge: clip; model: item.glb"');
  expect(doc.diagnostics).toEqual([]);
  const items = doc.renderNodes.filter(n => n.model); expect(items).toHaveLength(5);
  expect(items[0].bounds.maxX).toBeCloseTo(.79);
  expect(items.at(-1)!.bounds.maxY).toBeCloseTo(1.3375);
 });
 it('attaches to both sides of a shared partition and skips missing outer faces', () => {
  const doc = scene('"Cabinet/Lining/++/++/+0+1m":"cell: all; surface: walls; model: tile.glb"', cabinet.replace('observable: true','box-surface-front: none; observable: true'));
  expect(doc.diagnostics).toEqual([]);
  const tiles = doc.renderNodes.filter(n => n.model);
  expect(findNodeByLineNumber(doc.nodes,2)?.model).toBeDefined();
  expect(tiles.every(n => Array.isArray(n.metadata?.cellIndices))).toBe(true);
  expect(tiles).toHaveLength(84); // 96 cell walls minus 12 omitted outer fronts.
  const internal = tiles.filter(n => String(n.metadata?.attachedPanelId).endsWith('#partition-grid'));
  expect(internal.length).toBeGreaterThan(0);
  expect(internal.every(n => n.surfaceVisibility?.observable === false)).toBe(true);
 });
 it('fans out cuts to the partition solid and attached models', () => {
  const doc = scene('"Cabinet/Lining/++/++/+0+1m":"cell: all; surface: walls; model: tile.glb"\n"Cut/+0+12d/+2d+2d/+0+4d":"operation: subtraction"');
  expect(doc.diagnostics).toEqual([]);
  expect(doc.csgExpressions.some(e => e.base.geometry.partitionGrid)).toBe(true);
  expect(doc.renderNodes.some(n => n.modelCsgOperations?.length)).toBe(true);
 });
 it('retains grids and cell selection through references and scales once', () => {
  const doc = scene('"Cabinet/Item/++/++/++":"cell: 2 3 1; model: item.glb"\n"Copy/+2+24d/+0+36d/+0+8d":"ref: Cabinet; ref-scale: true"');
  expect(doc.diagnostics).toEqual([]);
  const item = doc.renderNodes.find(n => n.model && n.namespacePath?.startsWith('Copy/'))!;
  expect(item.bounds.minX).toBeCloseTo(2.82); expect(item.bounds.minY).toBeCloseTo(1.81);
  expect(item.bounds.maxX-item.bounds.minX).toBeCloseTo(.76);
  const cancelled = scene('"Copy/+2+12d/+0+18d/+0+4d":"ref: Cabinet; box-grid: none"');
  expect(cancelled.diagnostics).toEqual([]);
  expect(cancelled.renderNodes.filter(n=>n.geometry.partitionGrid)).toHaveLength(1);
 });
 it('supports count longhands and declaration order', () => {
  const doc = scene('', cabinet.replace('box-grid: 3 4 2','box-grid: 2 2 2; box-grid-columns: 4; box-grid-rows: 1; box-grid-slices: 3'));
  expect(doc.diagnostics).toEqual([]);
  expect(doc.renderNodes.find(n=>n.geometry.partitionGrid)!.geometry.partitionGrid!.counts).toEqual([4,1,3]);
 });
 it.each(['box-grid: 0 2 2','box-grid: 2 2','box-grid: 1.5 2 2','box-grid: 9007199254740992 1 1','box-grid: 3 4 2; box-partition: 1 white','box-grid: 3 4 2; box-partition: -1c red'])('rejects invalid layouts: %s', props => {
  const doc = scene('', `"Cabinet/+0+12d/+0+18d/+0+4d":"box-surface: 2c white; ${props}"`);
  expect(doc.diagnostics.length).toBeGreaterThan(0); expect(doc.renderNodes).toHaveLength(0);
 });
 it.each(['cell: 4 1 1','cell: 0 1 1','cell: 1 1','cell: -1 1 1'])('omits invalid cell children: %s', props => {
  const doc = scene(`"Cabinet/Bad/+0+1c/+0+1c/+0+1c":"${props}; model: bad.glb"`);
  expect(doc.diagnostics.length).toBeGreaterThan(0); expect(doc.renderNodes.some(n=>n.model)).toBe(false);
 });
 it('rejects grids without shells, cells without grids and excessive expansion atomically', () => {
  for (const source of ['"A/+0+2/+0+2/+0+2":"box-grid: 2 2 2; box-partition: 1c red"', '"A/+0+2/+0+2/+0+2":"cell: all"', cabinet.replace('3 4 2','10000 1 1').replace('1c gray','1m gray')]) {
   const doc = createSpatialDocument(source); expect(doc.diagnostics.length).toBeGreaterThan(0); expect(doc.renderNodes).toHaveLength(0);
  }
  const doc = scene('', cabinet.replace('3 4 2','50 50 50').replace('1c gray','1m gray'));
  expect(doc.diagnostics.some(d=>d.message.includes('budget'))).toBe(true); expect(doc.nodes).toHaveLength(0);
 });
 it('bounds repeated grid expansion and recovers the budget for independent roots', () => {
  const source = '"Parent/+0+12/+0+2/+0+1":""\n"Parent/Grid/+0+1/+0+1/+0+1":"box-surface: 1c white; box-grid: 6 6 6; box-partition: 1m gray; repeat: x"\n"Valid/+20+1/+0+1/+0+1":"box-surface: 1c white; box-grid: 2 1 1; box-partition: 1c red"';
  const doc=createSpatialDocument(source);
  expect(doc.diagnostics.some(d=>d.message.includes('budget'))).toBe(true);
  expect(doc.nodes).toHaveLength(1); expect(doc.nodes[0].namespacePath).toBe('Valid/');
  expect(doc.renderNodes).toHaveLength(7);
 });
 it('rotates cell frames once and supports nested grids without inheriting the outer grid', () => {
  const doc=scene('"Cabinet/Inner/++/++/++":"cell: 2 3 1; box-surface: 1m red; box-grid: 2 1 1; box-partition: 1m blue"\n"Cabinet/Inner/Item/++/++/++":"cell: all; model: item.glb"',cabinet);
  expect(doc.diagnostics).toEqual([]);
  expect(doc.renderNodes.filter(n=>n.geometry.partitionGrid)).toHaveLength(2);
  expect(doc.renderNodes.filter(n=>n.model)).toHaveLength(2);
  const rotated=scene('"Cabinet/Item/+0+1c/+0+1c/+0+1c":"cell: 2 3 1; model: item.glb"',cabinet.replace('observable: true','rotation: 0,0,90'));
  expect(rotated.diagnostics).toEqual([]);
  const item=rotated.renderNodes.find(n=>n.model)!;
  expect(item.bounds.minX).toBeCloseTo(-.915); expect(item.bounds.minY).toBeCloseTo(.41);
 });

});
