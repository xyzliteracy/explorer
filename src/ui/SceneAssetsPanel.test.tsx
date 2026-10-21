// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SceneAssetsPanel } from './SceneAssetsPanel';
afterEach(cleanup);
it('opens folders and exposes remote switching and errors', () => {
  const onOpenFolder = vi.fn(async () => {}), onUseRemote = vi.fn();
  render(<SceneAssetsPanel isLocal error="Missing local model: chair.glb" onOpenFolder={onOpenFolder} onUseRemote={onUseRemote} />);
  const file = new File(['source'], 'scene.xyz');
  fireEvent.change(screen.getByLabelText('Open scene folder'), { target: { files: [file] } });
  expect(onOpenFolder).toHaveBeenCalledWith([file]);
  fireEvent.click(screen.getByRole('button', { name: 'Use remote model store' }));
  expect(onUseRemote).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert').textContent).toContain('chair.glb');
});
