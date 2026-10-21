import type { XyzDslReferenceSpec } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';
import { canonicalNamespacePath, normalizeNamespacePath } from './pathParser';

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function parseReferenceDeclaration(
  declarations: XyzDslPropertyDeclaration[],
): XyzDslReferenceSpec {
  const declaration = declarations.find(({ property }) => property === 'ref');
  const scaleDeclaration = declarations.find(
    ({ property }) => property === 'ref-scale',
  );
  const diagnostics: string[] = [];
  const scale = scaleDeclaration
    ? parseBoolean(scaleDeclaration.value)
    : undefined;

  if (scaleDeclaration && scale === undefined) {
    diagnostics.push(
      `Reference scale must be a boolean, received "${scaleDeclaration.value}".`,
    );
  }

  if (!declaration) {
    return { ...(scale === undefined ? {} : { scale }), diagnostics };
  }

  const normalized = normalizeNamespacePath(declaration.value);

  if (!normalized) {
    return {
      ...(scale === undefined ? {} : { scale }),
      diagnostics: [...diagnostics, 'Reference target cannot be empty.'],
    };
  }

  return {
    targetPath: canonicalNamespacePath(normalized.split('/')),
    ...(scale === undefined ? {} : { scale }),
    diagnostics,
  };
}
