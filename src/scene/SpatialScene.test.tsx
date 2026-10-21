// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { SpatialScene } from './SpatialScene';
const renderer = vi.hoisted(() => ({ localClippingEnabled: false }));
vi.mock('@react-three/fiber', () => ({ useThree: (select: any) => select({ gl: renderer }) }));
vi.mock('./ModelPrimitive', () => ({ ModelPrimitive: (props: any) => <span data-testid="model" data-resolved={String(props.resolved)}>{props.node.model.source}</span> }));
vi.mock('./ContentPrimitive', () => ({ ContentPrimitive: (props: any) => <span data-testid="content">{props.node.content.text}</span> }));
vi.mock('./SpatialPrimitive', () => ({ SpatialPrimitive: (props: any) => <span data-testid="primitive">{props.node.geometry.kind}</span> }));
vi.mock('./CsgPrimitive', () => ({ CsgPrimitive: () => <span data-testid="csg"/> }));
afterEach(cleanup);
it('dispatches model, content, and primitive declarations in one shared renderer', () => {
 const document = createSpatialDocument('"Box/+0+1/+0+1/+0+1":"geometry: sphere"\n"Model/+2+1/+0+1/+0+1":"model: chair.glb"\n"Text/+4+1/+0+1/+0+1":"content-kind: text; content-text: Hello"');
 expect(document.diagnostics).toEqual([]);
 render(<SpatialScene document={document}/>);
 expect(renderer.localClippingEnabled).toBe(true);
 expect(screen.getByTestId('primitive').textContent).toBe('sphere');
 expect(screen.getByTestId('model').textContent).toBe('chair.glb');
 expect(screen.getByTestId('content').textContent).toBe('Hello');
});
it('preserves a native content adapter and already resolved asset policy', () => {
 const document = createSpatialDocument('"Model/+0+1/+0+1/+0+1":"model: chair.glb"\n"Text/+2+1/+0+1/+0+1":"content-kind: text; content-text: Hello"');
 render(<SpatialScene document={document} resolvedModels renderContent={node => <span data-testid="native-content">{node.content?.kind === 'text' ? node.content.text : ''}</span>}/>);
 expect(screen.getByTestId('model').getAttribute('data-resolved')).toBe('true');
 expect(screen.getByTestId('native-content').textContent).toBe('Hello');
 expect(screen.queryByTestId('content')).toBeNull();
});
