import type { XyzDslCsgOperation, XyzDslGeometryKind, XyzDslGeometrySpec } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';

const SUPPORTED_GEOMETRY_KINDS = new Set<XyzDslGeometryKind>(['box', 'cylinder', 'cone', 'sphere']);
const COMPACT_GEOMETRY_STRENGTH_MAX = 5;
const SUPPORTED_CSG_OPERATIONS = new Set<XyzDslCsgOperation>(['union', 'subtraction', 'intersection']);

function parseRoundedBoxRadius(declaration: XyzDslPropertyDeclaration): { value?: number; diagnostics: string[] } {
  const numericValue = Number(declaration.value);

  if (Number.isNaN(numericValue)) {
    return { diagnostics: ['box-radius must be numeric.'] };
  }

  if (numericValue < 0) {
    return { diagnostics: ['box-radius must be greater than or equal to 0.'] };
  }

  return { value: numericValue, diagnostics: [] };
}

function parseCompactGeometryStrength(
  declaration: XyzDslPropertyDeclaration,
  propertyName: string,
): { value?: number; diagnostics: string[] } {
  const numericValue = Number(declaration.value);

  if (Number.isNaN(numericValue)) {
    return { diagnostics: [`${propertyName} must be numeric.`] };
  }

  if (numericValue < 0 || numericValue > COMPACT_GEOMETRY_STRENGTH_MAX) {
    return { diagnostics: [`${propertyName} must be between 0 and ${COMPACT_GEOMETRY_STRENGTH_MAX}.`] };
  }

  return { value: numericValue, diagnostics: [] };
}

export function parseGeometryDeclaration(declarations: XyzDslPropertyDeclaration[]): XyzDslGeometrySpec {
  const geometry: XyzDslGeometrySpec = { kind: 'box', diagnostics: [] };
  const declaration = declarations.find(({ property }) => property === 'geometry');
  const radiusDeclaration = declarations.find(({ property }) => property === 'box-radius');
  const puffDeclaration = declarations.find(({ property }) => property === 'puff');
  const operationDeclaration = declarations.find(({ property }) => property === 'operation');

  if (declaration) {
    if (!SUPPORTED_GEOMETRY_KINDS.has(declaration.value as XyzDslGeometryKind)) {
      geometry.diagnostics.push(`Unsupported geometry "${declaration.value}". Falling back to box geometry.`);
      geometry.declared = true;
      geometry.kindDeclared = true;
    } else {
      geometry.kind = declaration.value as XyzDslGeometryKind;
      geometry.declared = true;
      geometry.kindDeclared = true;
    }
  }

  if (radiusDeclaration) {
    const { value: radius, diagnostics } = parseRoundedBoxRadius(radiusDeclaration);
    geometry.diagnostics.push(...diagnostics);

    if (radius !== undefined) {
      if (geometry.kind !== 'box') {
        geometry.diagnostics.push('box-radius only applies to box geometry.');
      } else {
        geometry.declared = true;
        geometry['box-radius'] = radius;
      }
    }
  }

  if (puffDeclaration) {
    const { value: puff, diagnostics } = parseCompactGeometryStrength(puffDeclaration, 'puff');
    geometry.diagnostics.push(...diagnostics);

    if (puff !== undefined) {
      if (geometry.kind !== 'box') {
        geometry.diagnostics.push('puff currently applies to box geometry.');
      } else {
        geometry.declared = true;
        geometry.puff = puff;
      }
    }
  }

  if (operationDeclaration) {
    if (!SUPPORTED_CSG_OPERATIONS.has(operationDeclaration.value as XyzDslCsgOperation)) {
      geometry.diagnostics.push(`Unsupported operation "${operationDeclaration.value}". Expected union, subtraction, or intersection.`);
    } else {
      geometry.declared = true;
      geometry.operation = operationDeclaration.value as XyzDslCsgOperation;
    }
  }

  return geometry;
}
