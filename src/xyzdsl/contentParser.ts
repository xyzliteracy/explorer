import type { XyzDslContentSpec } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';

function declarationValue(declarations: XyzDslPropertyDeclaration[], property: string): string | undefined {
  return declarations.find((declaration) => declaration.property === property)?.value;
}

function decodeUriProperty(value: string, property: string): { value?: string; diagnostics: string[] } {
  try {
    return { value: decodeURIComponent(value), diagnostics: [] };
  } catch {
    return { diagnostics: [`${property} must be valid URI-encoded text.`] };
  }
}

function isSupportedHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseContentDeclaration(declarations: XyzDslPropertyDeclaration[]): XyzDslContentSpec {
  const kindDeclaration = declarationValue(declarations, 'content-kind');
  const textDeclaration = declarationValue(declarations, 'content-text');
  const encodedTextDeclaration = declarationValue(declarations, 'content-text-uri');
  const urlDeclaration = declarationValue(declarations, 'content-url');
  const encodedUrlDeclaration = declarationValue(declarations, 'content-url-uri');
  const diagnostics: string[] = [];

  if (!kindDeclaration && !textDeclaration && !encodedTextDeclaration && !urlDeclaration && !encodedUrlDeclaration) {
    return { diagnostics };
  }

  if (kindDeclaration !== 'text' && kindDeclaration !== 'url') {
    diagnostics.push(`Unsupported content-kind "${kindDeclaration ?? ''}". Use "text" or "url".`);
    return { diagnostics };
  }

  if (kindDeclaration === 'text') {
    const decoded = encodedTextDeclaration === undefined
      ? { value: textDeclaration, diagnostics: [] }
      : decodeUriProperty(encodedTextDeclaration, 'content-text-uri');
    diagnostics.push(...decoded.diagnostics);

    if (!decoded.value) {
      diagnostics.push('Text content declarations require content-text or content-text-uri.');
      return { kind: 'text', text: '', diagnostics };
    }

    return { kind: 'text', text: decoded.value, diagnostics };
  }

  const decoded = encodedUrlDeclaration === undefined
    ? { value: urlDeclaration, diagnostics: [] }
    : decodeUriProperty(encodedUrlDeclaration, 'content-url-uri');
  diagnostics.push(...decoded.diagnostics);

  if (!decoded.value) {
    diagnostics.push('URL content declarations require content-url or content-url-uri.');
    return { kind: 'url', url: '', diagnostics };
  }

  if (!isSupportedHttpUrl(decoded.value)) {
    diagnostics.push('URL content declarations require an absolute http or https URL.');
  }

  return { kind: 'url', url: decoded.value, diagnostics };
}
