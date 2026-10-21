import { useMemo, useState, type ReactNode } from 'react';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { SceneRoot } from '../scene/SceneRoot';
import { findNodeById, findNodeByLineNumber, findNodePathById, lineNumberForNode, sceneHighlightIdForNode, selectionTargetForNodeId } from '../selection';
import { appendProspectiveObjectDeclaration, canEditDeclarationLine, moveDeclarationPath, resizeDeclarationPath, rotateDeclarationPath, updateDeclarationProperty } from '../xyzdsl/editXyzDslSource';
import type { AxisName } from '../xyzdsl/types';
import { linearTransformStepForNode } from '../model/transformStep';
import { EditorLayout } from './EditorLayout';
import { WorkspacePanel } from './WorkspacePanel';
import { XyzDslTreeView } from './XyzDslTreeView';
import { SelectedNodeInspector, type LinearStepChoice, type RotationStep } from './SelectedNodeInspector';
import { XyzDslEditor } from './XyzDslEditor';
import { useMobileViewport } from './useMobileViewport';

/** Controlled editor: hosts own source persistence and asset policy. */
export function VisualEditor({ source, onChange, assetsPanel, assetError }: { source: string; onChange: (source: string) => void; assetsPanel?: ReactNode; assetError?: string }) {
 const mobile = useMobileViewport();
 const [requestedMode, setMode] = useState<'viewer' | 'editor'>();
 const mode = requestedMode ?? (mobile ? 'viewer' : 'editor');
 const [tab,setTab] = useState('objects');
 const [line,setLine] = useState<number>();
 const [highlightLine,setHighlightLine] = useState<number>();
 const [linearStepChoice,setLinearStepChoice] = useState<LinearStepChoice>('auto');
 const [rotationStep,setRotationStep] = useState<RotationStep>(1);
 const document = useMemo(() => createSpatialDocument(source), [source]);
 const node = findNodeByLineNumber(document.nodes, line);
 const highlighted = findNodeByLineNumber(document.nodes, highlightLine);
 const canEdit = line !== undefined && canEditDeclarationLine(source, line);
 const select = (id?: string, exact = false) => {
  const leaf = findNodeById(document.nodes, id);
  const target = exact ? leaf : selectionTargetForNodeId(document.nodes, id);
  setLine(lineNumberForNode(target)); setHighlightLine(lineNumberForNode(leaf));
 };
 const edit = (operation: (source: string, line: number) => string) => { if (canEdit && line !== undefined) onChange(operation(source,line)); };
 const move = (axis: AxisName, delta: number) => edit((s,l) => moveDeclarationPath(s,l,axis,delta));
 const resize = (axis: AxisName, delta: number) => edit((s,l) => resizeDeclarationPath(s,l,axis,delta));
 const rotate = (axis: AxisName, delta: number) => edit((s,l) => rotateDeclarationPath(s,l,axis,delta,(node?.localTransform?.rotation ?? node?.transform.rotation)?.map(r => r * 180 / Math.PI) as [number,number,number] | undefined));
 const create = (position: [number,number,number]) => { const next = appendProspectiveObjectDeclaration(source,position); onChange(next.source); setLine(next.lineNumber); setHighlightLine(next.lineNumber); };
 const linearStep = linearStepChoice === 'auto' ? node ? linearTransformStepForNode(node) : .01 : linearStepChoice;
 return <EditorLayout editing={mode === 'editor'}>
 {assetError ? <section className="scene-viewport"><p role="alert">{assetError}</p></section> : <SceneRoot document={document} selectedNodeId={sceneHighlightIdForNode(document.nodes, highlighted ?? node)} onSelectNode={id => select(id)} editorMode={mode === 'editor'} selectedNodeCanEdit={canEdit} editorLinearStep={linearStep} editorRotationStep={rotationStep} linearStepChoice={linearStepChoice} onLinearStepChoiceChange={setLinearStepChoice} onRotationStepChange={setRotationStep} onMoveNode={move} onResizeNode={resize} onRotateNode={rotate} onCreateNode={create}/>}
 <WorkspacePanel mode={mode} open onModeChange={setMode} activeTab={tab} onTabChange={setTab} tabs={[{id:'objects',label:'Objects'},{id:'source',label:'Source'},{id:'assets',label:'Assets'},{id:'problems',label:'Problems',count:document.diagnostics.length}]}>
 {tab === 'objects' && <div className="object-workspace"><XyzDslTreeView document={document} selectedNodeId={node?.id} onSelectNode={id => select(id,true)}/><SelectedNodeInspector node={node} canEdit={canEdit} selectionPath={findNodePathById(document.nodes,node?.id)} onClearSelection={() => select(undefined)} onMove={move} onResize={resize} onRotate={rotate} onPathNodeSelect={id => setLine(lineNumberForNode(findNodeById(document.nodes,id)))} onPropertyChange={(key,value) => edit((s,l) => updateDeclarationProperty(s,l,key,value))} onSelectNode={id => select(id,true)} linearStepChoice={linearStepChoice} rotationStep={rotationStep} onLinearStepChoiceChange={setLinearStepChoice} onRotationStepChange={setRotationStep}/></div>}
 {tab === 'source' && <div className="drawer-tool-section"><XyzDslEditor value={source} description="Edit local spatial declarations. Bare path numbers are metres; d, c, and m use decimetres, centimetres, and millimetres." onChange={onChange} actions={<button type="button" onClick={() => { const url = URL.createObjectURL(new Blob([source],{type:'text/plain'})); const link = window.document.createElement('a'); link.href=url; link.download='scene.xyz'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }}>Save scene.xyz</button>}/></div>}
 {tab === 'assets' && <div className="drawer-tool-section">{assetsPanel}</div>}
 {tab === 'problems' && <div className="drawer-tool-section problems-panel">{document.diagnostics.length ? document.diagnostics.map((d,i) => <p key={i}>Line {d.line}: {d.message}</p>) : <p>No problems detected.</p>}</div>}
 </WorkspacePanel></EditorLayout>;
}
