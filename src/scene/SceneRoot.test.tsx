// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';

vi.mock('@react-three/fiber', async importOriginal => ({ ...await importOriginal<typeof import('@react-three/fiber')>(), Canvas: () => null }));
import { SceneRoot } from './SceneRoot';
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
