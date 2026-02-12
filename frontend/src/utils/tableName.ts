/**
 * Derive a valid SQL table name from a raw source identifier.
 *
 * Rules:
 * - Strip file extension (e.g. `.csv`, `.json`, `.parquet`)
 * - Replace non-alphanumeric/underscore characters with `_`
 * - Collapse consecutive underscores
 * - Prepend `_` if the result starts with a digit
 * - Disambiguate against existing names by appending `_2`, `_3`, etc.
 */
export function deriveTableName(raw: string, existingNames: string[] = []): string {
  // Strip file extension
  let name = raw.replace(/\.[^.]+$/, '');

  // Replace non-alphanumeric/underscore with underscore
  name = name.replace(/[^a-zA-Z0-9_]/g, '_');

  // Collapse consecutive underscores
  name = name.replace(/_+/g, '_');

  // Strip leading/trailing underscores (unless that would empty it)
  name = name.replace(/^_+|_+$/g, '') || name;

  // Prepend _ if starts with a digit
  if (/^\d/.test(name)) {
    name = `_${name}`;
  }

  // Fallback for empty result
  if (!name) {
    name = 'source';
  }

  // Lowercase for consistency
  name = name.toLowerCase();

  // Disambiguate against existing names
  const lowerExisting = existingNames.map((n) => n.toLowerCase());
  if (!lowerExisting.includes(name)) {
    return name;
  }

  let counter = 2;
  while (lowerExisting.includes(`${name}_${counter}`)) {
    counter++;
  }
  return `${name}_${counter}`;
}

/**
 * Extract a table name candidate from a URL path.
 * Uses the last non-empty path segment.
 */
export function tableNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    return segments[segments.length - 1];
  } catch {
    // Not a valid URL yet — try extracting last path-like segment
    const match = url.match(/\/([^/?#]+)\s*$/);
    return match ? match[1] : null;
  }
}
