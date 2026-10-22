export type AxisName = 'x' | 'y' | 'z';

export interface XyzDslAxisSpec {
  axis: AxisName;
  offset: number | 'end';
  size: number | 'fill';
}

export interface XyzDslBoxSpec {
  /** Dimensions on these axes are unresolved until parent layout is available. */
  fillAxes?: AxisName[];
  /** Offsets resolved as parent extent minus fixed size. */
  endAxes?: AxisName[];
  source: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

export interface XyzDslPathSpec {
  source: string;
  namespace: string[];
  box?: XyzDslBoxSpec;
  canonicalPath: string;
  isDeclarationOnly: boolean;
}

export type XyzDslGeometryKind = 'box' | 'cylinder' | 'cone' | 'sphere';
export type XyzDslCsgOperation = 'union' | 'subtraction' | 'intersection';

export interface XyzDslGeometrySpec {
  kind: XyzDslGeometryKind;
  diagnostics: string[];
  declared?: boolean;
  kindDeclared?: boolean;
  'box-radius'?: number;
  puff?: number;
  operation?: XyzDslCsgOperation;
}


export type XyzDslObservable = false | '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface XyzDslMaterialSpec {
  observable?: XyzDslObservable;
  color?: string | number;
  metalness?: number;
  roughness?: number;
  diagnostics: string[];
}

export interface XyzDslTransformSpec {
  rotation: [number, number, number];
  diagnostics: string[];
  declared?: boolean;
}

export type XyzDslModelFit = 'contain' | 'stretch';
export type XyzDslModelAlign = 'center' | 'floor';

export interface XyzDslModelSpec {
  previewSource?: string;
  detailSource?: string;
  source?: string;
  fit: XyzDslModelFit;
  align: XyzDslModelAlign;
  declared?: boolean;
  sourceDeclared?: boolean;
  fitDeclared?: boolean;
  alignDeclared?: boolean;
  /** Imported-model XYZ Euler correction in radians, applied before fitting. */
  reorientation?: [number, number, number];
  reorientationDeclared?: boolean;
  diagnostics: string[];
}

export type XyzDslContentSpec =
  | { kind?: undefined; diagnostics: string[] }
  | { kind: 'text'; text: string; diagnostics: string[] }
  | { kind: 'url'; url: string; diagnostics: string[] };

export interface XyzDslReferenceSpec {
  targetPath?: string;
  scale?: boolean;
  diagnostics: string[];
}

export interface XyzDslLightSpec {
  intensity: number;
  color: string | number;
  distance: number;
}

export interface XyzDslRepeatSpec {
  edge?: 'whole' | 'clip';
  axes: AxisName[];
  gap: number;
  invalid?: boolean;
}

export type SurfaceFace = 'top' | 'right' | 'bottom' | 'left' | 'front' | 'back';
export interface SurfacePanelSpec { thickness: number; color: string | number }
export interface XyzDslBoxSurfaceSpec {
  faces: Record<SurfaceFace, SurfacePanelSpec | null>;
  observable: Partial<Record<SurfaceFace, XyzDslObservable | true>>;
  invalid?: boolean;
}

export interface SpatialObject {
  surface?: import('./surfaceAttachment').SurfaceAttachment;
  surfaceDeclarations?: import('./propertyParser').XyzDslPropertyDeclaration[];
  boxSurface?: XyzDslBoxSurfaceSpec | null;
  repeat?: XyzDslRepeatSpec;
  light?: XyzDslLightSpec;
  viewPoint?: boolean;
  id: string;
  source: string;
  path: XyzDslPathSpec;
  namespace: string[];
  box?: XyzDslBoxSpec;
  material: XyzDslMaterialSpec;
  geometry: XyzDslGeometrySpec;
  transform: XyzDslTransformSpec;
  reference: XyzDslReferenceSpec;
  content: XyzDslContentSpec;
  model: XyzDslModelSpec;
  declarationOnly: boolean;
  lineNumber: number;
  unionGroupId?: string;
}

export interface ParseDiagnostic {
  line: number;
  message: string;
  source: string;
}

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  diagnostics: ParseDiagnostic[];
}
