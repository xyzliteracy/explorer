import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { nodesForRoomSizing } from './roomSizing';
import { viewPoints } from './viewPoints';

describe('view point markers', () => {
  it('keeps markers invisible and out of room bounds and CSG', () => {
    const document = createSpatialDocument(`"+1+2/+3+4/+5+6":"view-point: true; operation: subtraction"
"+0+1/+0+1/+0+1":"color: blue"`);
    expect(document.diagnostics).toEqual([]);
    expect(viewPoints(document)[0].transform.position).toEqual([2, 5, 8]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.csgExpressions).toEqual([]);
    expect(nodesForRoomSizing(document)).toEqual(document.renderNodes);
  });
  it('uses nested world transforms but sorts by source order', () => {
    const document = createSpatialDocument(`"Room/+10+10/+0+10/+0+10":""
"Room/Point/+1+2/+3+4/+5+6":"view-point: true; rotation: 0,90,0"
"+0+2/+0+2/+0+2":"view-point: true"`);
    const points = viewPoints(document);
    expect(points.map(p => p.metadata?.lineNumber)).toEqual([2, 3]);
    expect(points[0].transform.position).toEqual([12, 5, 8]);
    expect(points[0].transform.rotation[1]).toBeCloseTo(Math.PI / 2);
  });
  it('does not inherit markers and diagnoses invalid values', () => {
    const document = createSpatialDocument(`"Room/":"view-point: true"
"Room/+0+1/+0+1/+0+1":""
"+0+1/+0+1/+0+1":"view-point: false"
"+0+1/+0+1/+0+1":"view-point: yes"`);
    expect(viewPoints(document)).toEqual([]);
    expect(document.renderNodes).toHaveLength(3);
    expect(document.diagnostics.map(d => d.message)).toContain('view-point must be true or false.');
  });
  it('preserves concrete markers in reference copies', () => {
    const document = createSpatialDocument(`"Tour/Point/+1+2/+0+2/+0+2":"view-point: true"
"Copy/+10+10/+0+10/+0+10":"ref: Tour/"`);
    expect(viewPoints(document)).toHaveLength(1);
    expect(viewPoints(document)[0].transform.position).toEqual([12, 1, 1]);
  });
});
