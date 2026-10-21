import type { XyzDslTransformSpec } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';

const ROTATION_PROPERTIES = new Set(['rotation', 'rotate']);
const ROTATION_COMPONENT_COUNT = 3;

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function parseTransformDeclaration(declarations: XyzDslPropertyDeclaration[]): XyzDslTransformSpec {
  const transform: XyzDslTransformSpec = { rotation: [0, 0, 0], diagnostics: [] };
  const declaration = declarations.find(({ property }) => ROTATION_PROPERTIES.has(property));

  if (!declaration) {
    return transform;
  }

  const components = declaration.value
    .split(',')
    .map((component) => component.trim())
    .filter(Boolean);

  if (components.length !== ROTATION_COMPONENT_COUNT) {
    transform.diagnostics.push(
      `Rotation must provide X, Y, and Z degrees as comma-separated values, received "${declaration.value}".`,
    );
    return transform;
  }

  const degrees = components.map((component) => Number(component));
  const invalidComponent = components.find((_, index) => Number.isNaN(degrees[index]));

  if (invalidComponent) {
    transform.diagnostics.push(`Rotation component "${invalidComponent}" must be numeric.`);
    return transform;
  }

  return {
    rotation: [degreesToRadians(degrees[0]), degreesToRadians(degrees[1]), degreesToRadians(degrees[2])],
    diagnostics: [],
    declared: true,
  };
}
