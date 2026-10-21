export interface XyzDslPropertyDeclaration {
  property: string;
  value: string;
  source: string;
}

export function parsePropertyDeclarations(source: string): { declarations: XyzDslPropertyDeclaration[]; diagnostics: string[] } {
  const declarations: XyzDslPropertyDeclaration[] = [];
  const diagnostics: string[] = [];

  source
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .forEach((declaration) => {
      const [rawProperty, ...rawValueParts] = declaration.split(':');
      const property = rawProperty?.trim();
      const value = rawValueParts.join(':').trim();

      if (!property || !value) {
        diagnostics.push(`Ignoring malformed declaration "${declaration}".`);
        return;
      }

      declarations.push({ property, value, source: declaration });
    });

  return { declarations, diagnostics };
}
