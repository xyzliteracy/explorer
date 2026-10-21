// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';

const canvas = vi.hoisted(() => ({ children: undefined as unknown, props: undefined as any }));
vi.mock('@react-three/fiber', async importOriginal => ({ ...await importOriginal<typeof import('@react-three/fiber')>(), Canvas: (props: any) => { canvas.children = props.children; canvas.props = props; return null; } }));
import { ModelRuntime } from '../performance/ModelRuntime';
import { SceneRoot } from './SceneRoot';
import { LightSourceMarker } from './LightSourceMarker';
import { SelectionBounds } from './SelectionBounds';
import { PerspectiveCamera } from '@react-three/drei';
import { CameraClipController } from './CameraClipController';
import { SpatialScene } from './SpatialScene';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const source = `"+0+1/+0+1/+0+1":"view-point: true"
"+2+1/+0+1/+0+1":"view-point: true"`;
const noop = () => {};
const props = {
  editorMode: false, selectedNodeCanEdit: false, editorLinearStep: .01, editorRotationStep: 1 as const,
  linearStepChoice: .01 as const, onLinearStepChoiceChange: noop, onRotationStepChange: noop,
  onMoveNode: noop, onResizeNode: noop, onRotateNode: noop, onCreateNode: noop,
};
function viewport(mobile: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: mobile, addEventListener: noop, removeEventListener: noop }));
}
describe('tour viewer controls', () => {
  it('shows only looping traversal overlays on mobile without quality, exit, or instructions', () => {
    viewport(true);
    render(<SceneRoot {...props} document={createSpatialDocument(source)} />);
    expect(screen.getByRole('status').textContent).toBe('View point 1 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Previous view point' }));
    expect(screen.getByRole('status').textContent).toBe('View point 2 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Next view point' }));
    expect(screen.getByRole('status').textContent).toBe('View point 1 of 2');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Exit tour')).toBeNull();
    expect(screen.queryByText(/Drag.*look/)).toBeNull();
  });
  it('has no redundant mobile controls for one point or the editor', () => {
    viewport(true);
    const document = createSpatialDocument(source.split('\n')[0]);
    const view = render(<SceneRoot {...props} document={document} />);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<SceneRoot {...props} editorMode document={document} />);
    expect(screen.queryByRole('navigation', { name: 'View point traversal' })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('retains desktop opt-in and exit while allowing end-to-start traversal', () => {
    viewport(false);
    render(<SceneRoot {...props} document={createSpatialDocument(source)} />);
    fireEvent.click(screen.getByRole('button', { name: /Start tour/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('status').textContent).toBe('View point 2 / 2');
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    expect(screen.getByRole('button', { name: /Start tour/ })).toBeDefined();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

function canvasElements(value: any): any[] {
  if (Array.isArray(value)) return value.flatMap(canvasElements);
  if (!value || typeof value !== 'object') return [];
  return [value, ...canvasElements(value.props?.children)];
}

it('uses room depth precision throughout a tour and restores distance-aware selection on exit', () => {
  viewport(false);
  const document = createSpatialDocument(source + '\n"Room/+0+109d/+0+3/+0+397c":""\n"Rug/+0+1/+0+1/+0+2c":"model: rug.glb"');
  const rug = document.nodes.find(node => node.model)!;
  render(<SceneRoot {...props} document={document} selectedNodeId={rug.id} />);
  const element = (type: unknown) => canvasElements(canvas.children).find(child => child.type === type);
  // Model bounds can be much thinner than the declared fitting box.
  act(() => element(SpatialScene).props.onPrecisionScaleChange(rug.id, .001));
  expect(element(PerspectiveCamera).props.near).toBeGreaterThan(.02);
  expect(element(CameraClipController).props.selectionBounds).toEqual(rug.bounds);
  expect(element(CameraClipController).props.scale).toBe(.001);
  fireEvent.click(screen.getByRole('button', { name: /Start tour/ }));
  expect(element(PerspectiveCamera).props.near).toBe(.05);
  expect(element(CameraClipController).props.scale).toBe(10);
  act(() => element(SpatialScene).props.onPrecisionScaleChange(rug.id, .002));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(element(PerspectiveCamera).props.near).toBe(.05);
  expect(element(CameraClipController).props.scale).toBe(10);
  fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
  expect(element(PerspectiveCamera).props.near).toBeGreaterThan(.02);
  expect(element(CameraClipController).props.selectionBounds).toEqual(rug.bounds);
  expect(element(CameraClipController).props.scale).toBe(.002);
});

it('shows light boxes only in the orbital editor, including when a light is selected', () => {
  viewport(false);
  const document = createSpatialDocument(source + '\n"lamp/+3+1/+0+1/+0+1":"light-source: true"');
  const light = document.nodes.find(node => node.light)!;
  const view = render(<SceneRoot {...props} document={document} selectedNodeId={light.id} />);
  expect(canvasElements(canvas.children).filter(element => element.type === LightSourceMarker || element.type === SelectionBounds)).toHaveLength(0);
  view.rerender(<SceneRoot {...props} editorMode document={document} selectedNodeId={light.id} />);
  const markers = canvasElements(canvas.children).filter(element => element.type === LightSourceMarker);
  expect(markers).toHaveLength(1);
  expect(markers[0].props.node).toBe(light);
  expect(markers[0].props.selected).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Start tour/ }));
  expect(canvasElements(canvas.children).filter(element => element.type === LightSourceMarker || element.type === SelectionBounds)).toHaveLength(0);
});

it('keeps preparation and recovery controls outside Canvas', () => {
  viewport(true);
  render(<SceneRoot {...props} document={createSpatialDocument(source)} />);
  const runtime = () => canvasElements(canvas.children).find(child => child.type === ModelRuntime);
  expect(screen.getByText('Preparing your scene…')).toBeDefined();
  act(() => runtime().props.onPreparation('error'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry models' }));
  expect(runtime().props.retry).toBe(1);
  act(() => runtime().props.onPreparation('context-lost'));
  expect(screen.getByRole('button', { name: 'Restart viewer' })).toBeDefined();
  act(() => runtime().props.onPreparation('ready'));
  expect(screen.queryByText('Preparing your scene…')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Restart viewer' })).toBeNull();
});

it('keeps mobile edges sharp while retaining the reduced-graphics recovery path', () => {
  viewport(true);
  render(<SceneRoot {...props} document={createSpatialDocument(source)} />);
  expect(canvas.props.dpr).toEqual([1, 1.5]);
  expect(canvas.props.gl.antialias).toBe(true);
  const runtime = () => canvasElements(canvas.children).find(child => child.type === ModelRuntime);
  act(() => runtime().props.onPreparation('context-lost'));
  expect(canvas.props.dpr).toEqual([1, 1]);
  expect(canvas.props.shadows).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Restart viewer' }));
  expect(canvas.props.gl.antialias).toBe(false);
  sessionStorage.clear();
});
