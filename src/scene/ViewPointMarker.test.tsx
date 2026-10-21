import { describe, expect, it, vi } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { cameraNodeForSelection } from './cameraSelection';
import { sceneHighlightIdForNode, selectionTargetForNodeId } from '../selection';
import { moveDeclarationPath, resizeDeclarationPath, rotateDeclarationPath } from '../xyzdsl/editXyzDslSource';
import { ViewPointMarker } from './ViewPointMarker';
import { viewPoints } from './viewPoints';
import { nodesForRoomSizing } from './roomSizing';
import type { ThreeEvent } from '@react-three/fiber';

const SOURCE = `"Room/+10+10/+0+10/+0+10":""
"Room/Point/+1+2/+3+4/+5+6":"view-point: true"`;

describe('view point visual authoring', () => {
  it('selects a nested marker itself and exposes its world bounds for highlighting', () => {
    const document = createSpatialDocument(SOURCE);
    const marker = viewPoints(document)[0];
    expect(selectionTargetForNodeId(document.nodes, marker.id)).toBe(marker);
    expect(sceneHighlightIdForNode(document.nodes, marker)).toBe(marker.id);
    expect(cameraNodeForSelection(document, marker.id)).toBe(marker);
    expect(marker.transform.position).toEqual([12, 5, 8]);
    expect(document.renderNodes).toEqual([]);
    expect(nodesForRoomSizing(document)).toEqual([]);
  });

  it('rewrites marker transforms while preserving the marker property', () => {
    const moved = moveDeclarationPath(SOURCE, 2, 'x', 1);
    const resized = resizeDeclarationPath(moved, 2, 'y', 2);
    const rotated = rotateDeclarationPath(resized, 2, 'y', 90);
    const document = createSpatialDocument(rotated);
    expect(document.diagnostics).toEqual([]);
    const marker = viewPoints(document)[0];
    expect(marker.transform.position).toEqual([13, 6, 8]);
    expect(marker.transform.scale).toEqual([2, 6, 6]);
    expect(marker.transform.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(document.renderNodes).toEqual([]);
  });

  it('uses the ordinary modifier-click selection and shows the camera direction', () => {
    const node = viewPoints(createSpatialDocument(SOURCE))[0];
    const onSelect = vi.fn();
    const helper = ViewPointMarker({ node, selected: false, onSelect });
    expect(helper.props.position).toEqual(node.transform.position);
    expect(helper.props.rotation).toEqual(node.transform.rotation);
    expect(helper.props.userData).toEqual({ spatialNodeId: node.id, povCollisionIgnored: true });
    const click = (ctrlKey: boolean, metaKey: boolean) => helper.props.onClick({ ctrlKey, metaKey, stopPropagation: vi.fn() } as unknown as ThreeEvent<MouseEvent>);
    click(false, false);
    expect(onSelect).not.toHaveBeenCalled();
    click(true, false);
    click(false, true);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith(node.id);
    const [box, arrow] = helper.props.children;
    expect(box.props.scale).toEqual(node.transform.scale);
    expect(arrow.props.args[0].toArray()).toEqual([0, 0, -1]);
  });
});
