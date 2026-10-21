import type { XyzDslModelAlign, XyzDslModelFit, XyzDslModelSpec } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';
import { validateModelSource } from '../model/resolveModelUrl';

const FITS = new Set<XyzDslModelFit>(['contain', 'stretch']);
const ALIGNS = new Set<XyzDslModelAlign>(['center', 'floor']);

export function parseModelDeclaration(declarations: XyzDslPropertyDeclaration[]): XyzDslModelSpec {
  const model: XyzDslModelSpec = { fit: 'contain', align: 'center', diagnostics: [] };
  const source = declarations.find(({ property }) => property === 'model');
  const fit = declarations.find(({ property }) => property === 'model-fit');
  const align = declarations.find(({ property }) => property === 'model-align');

  if (source) {
    try {
      validateModelSource(source.value);
      model.source = source.value;
      model.declared = true;
      model.sourceDeclared = true;
    } catch (error) {
      model.diagnostics.push(error instanceof Error ? error.message : 'Model URL is invalid.');
    }
  }
  for (const [property, key] of [['model-preview', 'previewSource'], ['model-detail', 'detailSource']] as const) {
    const declaration = declarations.find(item => item.property === property);
    if (!declaration) continue;
    try { validateModelSource(declaration.value); model[key] = declaration.value; model.declared = true; }
    catch (error) { model.diagnostics.push(String(error)); }
  }
  if (fit) {
    if (FITS.has(fit.value as XyzDslModelFit)) {
      model.fit = fit.value as XyzDslModelFit;
      model.declared = true;
      model.fitDeclared = true;
    }
    else model.diagnostics.push(`Unsupported model-fit "${fit.value}". Expected contain or stretch.`);
  }
  if (align) {
    if (ALIGNS.has(align.value as XyzDslModelAlign)) {
      model.align = align.value as XyzDslModelAlign;
      model.declared = true;
      model.alignDeclared = true;
    }
    else model.diagnostics.push(`Unsupported model-align "${align.value}". Expected center or floor.`);
  }
  const reorientation = declarations.find(({ property }) => property === 'reset-axes');
  if (reorientation) {
    const components = reorientation.value.split(',').map(component => component.trim());
    if (components.length !== 3 || components.some(component => component === '' || !Number.isFinite(Number(component)))) {
      model.diagnostics.push('reset-axes requires three finite X, Y, Z angles in degrees, separated by commas.');
    } else {
      model.reorientation = components.map(component => Number(component) * Math.PI / 180) as [number, number, number];
      model.reorientationDeclared = true;
      model.declared = true;
    }
  }
  return model;
}
