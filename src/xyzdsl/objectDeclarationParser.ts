import { parseContentDeclaration } from './contentParser';
import { parseGeometryDeclaration } from './geometryParser';
import { parseMaterialDeclaration, SUPPORTED_MATERIAL_KEYS } from './materialParser';
import { parsePropertyDeclarations } from './propertyParser';
import { parseReferenceDeclaration } from './referenceParser';
import { parseTransformDeclaration } from './transformParser';
import { parseModelDeclaration } from './modelParser';
import type {
  XyzDslContentSpec,
  XyzDslGeometrySpec,
  XyzDslMaterialSpec,
  XyzDslReferenceSpec,
  XyzDslTransformSpec,
} from './types';

const SUPPORTED_OBJECT_PROPERTIES = new Set([
  ...SUPPORTED_MATERIAL_KEYS,
  'view-point',
  'light-source',
  'light-intensity',
  'light-color',
  'light-distance',
  'geometry',
  'box-radius',
  'puff',
  'operation',
  'rotation',
  'rotate',
  'ref',
  'ref-scale',
  'content-kind',
  'content-text',
  'content-text-uri',
  'content-url',
  'content-url-uri',
  'model',
  'model-preview',
  'model-detail',
  'model-fit',
  'model-align',
]);

export interface XyzDslObjectPropertiesSpec {
  light?: import('./types').XyzDslLightSpec;
  viewPoint?: boolean;
  material: XyzDslMaterialSpec;
  geometry: XyzDslGeometrySpec;
  transform: XyzDslTransformSpec;
  reference: XyzDslReferenceSpec;
  content: XyzDslContentSpec;
  model: import('./types').XyzDslModelSpec;
  diagnostics: string[];
}

export function parseObjectProperties(source: string): XyzDslObjectPropertiesSpec {
  const { declarations, diagnostics } = parsePropertyDeclarations(source);
  const material = parseMaterialDeclaration(declarations);
  const geometry = parseGeometryDeclaration(declarations);
  const transform = parseTransformDeclaration(declarations);
  const reference = parseReferenceDeclaration(declarations);
  const content = parseContentDeclaration(declarations);
  const model = parseModelDeclaration(declarations);
  const unsupportedDiagnostics = declarations
    .filter(({ property }) => !SUPPORTED_OBJECT_PROPERTIES.has(property))
    .map(
      ({ property }) => `Ignoring unsupported object property "${property}".`,
    );

  const marker = declarations.filter(({ property }) => property === 'view-point').at(-1);
  if (marker && !['true', 'false'].includes(marker.value)) diagnostics.push('view-point must be true or false.');

  const lightValue = declarations.filter(d => d.property === 'light-source').at(-1)?.value;
  if (lightValue !== undefined && !['true', 'false', 'point'].includes(lightValue)) diagnostics.push('light-source must be true, false, or point.');
  const enabled = lightValue === 'true' || lightValue === 'point';
  const numericLight = (key: string, fallback: number) => {
    const raw = declarations.filter(d => d.property === key).at(-1)?.value;
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) { diagnostics.push(`${key} must be a finite non-negative number.`); return fallback; }
    return value;
  };
  const intensity = numericLight('light-intensity', 10);
  const distance = numericLight('light-distance', 0);
  const colorDeclaration = declarations.filter(d => d.property === 'light-color').at(-1);
  const lightMaterial = parseMaterialDeclaration(colorDeclaration ? [{ ...colorDeclaration, property: 'color' }] : []);
  diagnostics.push(...lightMaterial.diagnostics);
  if (!enabled && declarations.some(d => d.property.startsWith('light-') && d.property !== 'light-source')) diagnostics.push('Light options require light-source: true or point.');

  return {
    light: enabled ? { intensity, distance, color: lightMaterial.color ?? '#ffffff' } : undefined,
    viewPoint: marker?.value === 'true',
    material,
    geometry,
    transform,
    reference,
    content,
    model,
    diagnostics: [
      ...diagnostics,
      ...material.diagnostics,
      ...geometry.diagnostics,
      ...transform.diagnostics,
      ...reference.diagnostics,
      ...content.diagnostics,
      ...model.diagnostics,
      ...unsupportedDiagnostics,
    ],
  };
}
