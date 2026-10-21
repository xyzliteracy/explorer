import type { ParseDiagnostic } from '../xyzdsl/types';
import type { CsgExpression } from './csg';
import type { SpatialNode } from './SpatialNode';

export interface SpatialDocument {
  id: string;
  nodes: SpatialNode[];
  renderNodes: SpatialNode[];
  csgExpressions: CsgExpression[];
  diagnostics: ParseDiagnostic[];
}
