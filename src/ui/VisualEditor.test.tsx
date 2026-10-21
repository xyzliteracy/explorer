// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VisualEditor } from './VisualEditor';
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('./useMobileViewport', () => ({ useMobileViewport: () => viewport.mobile }));
beforeEach(() => { viewport.mobile = false; });
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.mock('../scene/SceneRoot', () => ({ SceneRoot: (props: any) => <div><output aria-label="Scene mode">{props.editorMode ? 'editor' : 'viewer'}</output><button onClick={() => props.onSelectNode(props.document.renderNodes[0].id)}>Pick box</button><button onClick={() => props.onMoveNode('x',1)}>Move box</button><button onClick={() => props.onCreateNode([2,0,0])}>Create box</button></div> }));
afterEach(cleanup);
function Host() { const [source,setSource] = useState('"Box/+0+1/+0+1/+0+1":"color: coral;"'); return <><VisualEditor source={source} onChange={setSource}/><output data-testid="source">{source}</output></>; }
it('edits the selected source declaration and retains selection after a transform', () => {
 render(<Host/>); fireEvent.click(screen.getByText('Pick box')); fireEvent.click(screen.getByText('Move box'));
 expect(screen.getByTestId('source').textContent).toContain('Box/+1+1');
 fireEvent.change(screen.getByLabelText('Color'), {target:{value:'blue'}});
 expect(screen.getByTestId('source').textContent).toContain('color: blue');
});
it('creates declarations, edits source, and switches between viewer and editor', () => {
 render(<Host/>); fireEvent.click(screen.getByText('Create box'));
 expect(screen.getByTestId('source').textContent?.split('\n')).toHaveLength(2);
 fireEvent.click(screen.getByRole('tab',{name:'Source'}));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'"Sphere/+0+1/+0+1/+0+1":"geometry: sphere"'}});
 expect(screen.getByTestId('source').textContent).toContain('Sphere');
 fireEvent.click(screen.getByRole('button',{name:'Viewer mode'}));
 expect(screen.queryByRole('tabpanel')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Editor mode'}));
 expect(screen.getByRole('tabpanel')).toBeTruthy();
});

it('starts mobile in viewer mode and lets the user open the editor', () => {
 viewport.mobile = true;
 render(<Host/>);
 expect(screen.queryByRole('tabpanel')).toBeNull();
 expect(screen.getByLabelText('Scene mode').textContent).toBe('viewer');
 fireEvent.click(screen.getByRole('button',{name:'Editor mode'}));
 expect(screen.getByRole('tabpanel')).toBeTruthy();
 expect(screen.getByLabelText('Scene mode').textContent).toBe('editor');
});
it('uses the viewport default until the user explicitly chooses a mode', () => {
 const view = render(<Host/>);
 viewport.mobile = true; view.rerender(<Host/>);
 expect(screen.queryByRole('tabpanel')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Editor mode'}));
 viewport.mobile = false; view.rerender(<Host/>);
 viewport.mobile = true; view.rerender(<Host/>);
 expect(screen.getByRole('tabpanel')).toBeTruthy();
});
