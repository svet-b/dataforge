/**
 * Regex for matching DuckDB numeric column types.
 * Shared between DataTable and ResultsChart to avoid duplication.
 */
export const NUMERIC_TYPE_RE =
  /^(INTEGER|BIGINT|SMALLINT|TINYINT|HUGEINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|INT|UBIGINT|UINTEGER|USMALLINT|UTINYINT)/i;

export function isNumericColumn(type: string): boolean {
  return NUMERIC_TYPE_RE.test(type);
}
