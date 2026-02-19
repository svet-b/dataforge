import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface JsonTreeProps {
  data: unknown;
  selectedPath?: string;
  onSelectPath?: (path: string) => void;
  /** Internal: dot-notation path of this node from the root. */
  path?: string;
  /** Internal: nesting depth, used to gate auto-expand behaviour. */
  depth?: number;
}

export default function JsonTree({
  data,
  selectedPath,
  onSelectPath,
  path = '',
  depth = 0,
}: JsonTreeProps) {
  const isArray = Array.isArray(data);
  const isObject = data !== null && typeof data === 'object' && !isArray;

  // Arrays: auto-collapse when > 3 items; objects: auto-expand when < 5 keys
  const defaultExpanded = isArray
    ? (data as unknown[]).length <= 3
    : isObject
      ? Object.keys(data as object).length < 5
      : false;

  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!isArray && !isObject) {
    return <JsonPrimitive value={data} />;
  }

  const isSelected = path !== '' && path === selectedPath;
  const isClickable = onSelectPath != null && path !== '';
  const entries: [string, unknown][] = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(data as Record<string, unknown>);
  const length = entries.length;

  // When collapsed, show only the first 3 items for arrays
  const visibleEntries = isArray && !expanded ? entries.slice(0, 3) : entries;
  const hiddenCount = isArray && !expanded ? Math.max(0, length - 3) : 0;

  const label = isArray ? `[${length}]` : `{${length}}`;

  return (
    <div className="font-mono text-xs">
      <div className="flex items-center gap-0.5">
        <button
          className="flex shrink-0 items-center text-gray-400 hover:text-gray-600"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>

        {isClickable ? (
          <button
            className={[
              'rounded px-1 py-0.5 text-left text-xs leading-tight',
              isSelected
                ? 'bg-blue-100 font-semibold text-blue-700'
                : isArray
                  ? 'text-green-700 hover:bg-green-50'
                  : 'text-gray-500 hover:bg-gray-100',
            ].join(' ')}
            onClick={() => onSelectPath(path)}
            title={
              isArray
                ? `Use "${path}" as response path`
                : `Select path "${path}"`
            }
          >
            <span className="font-medium">{path.split('.').pop()}</span>
            <span className="ml-1 text-gray-400">{label}</span>
            {isArray && (
              <span className="ml-1 text-green-500 opacity-80">← use path</span>
            )}
          </button>
        ) : (
          <span className="px-1 text-gray-400">{label}</span>
        )}
      </div>

      {expanded && (
        <div className="ml-3.5 border-l border-gray-200 pl-2">
          {visibleEntries.map(([key, value]) => {
            const childPath = path !== '' ? `${path}.${key}` : key;
            const childIsComplex =
              Array.isArray(value) ||
              (value !== null && typeof value === 'object');

            return (
              <div key={key} className="mt-0.5">
                {childIsComplex ? (
                  <JsonTree
                    data={value}
                    selectedPath={selectedPath}
                    onSelectPath={onSelectPath}
                    path={childPath}
                    depth={depth + 1}
                  />
                ) : (
                  <span className="text-xs">
                    {isObject && (
                      <span className="text-purple-600">{key}: </span>
                    )}
                    <JsonPrimitive value={value} />
                  </span>
                )}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button
              className="mt-0.5 text-xs text-blue-600 underline hover:text-blue-800"
              onClick={() => setExpanded(true)}
            >
              +{hiddenCount} more…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function JsonPrimitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-gray-400">null</span>;
  if (typeof value === 'boolean')
    return <span className="text-orange-600">{String(value)}</span>;
  if (typeof value === 'number')
    return <span className="text-blue-600">{String(value)}</span>;
  if (typeof value === 'string') {
    const display = value.length > 60 ? `${value.slice(0, 60)}…` : value;
    return <span className="text-green-700">"{display}"</span>;
  }
  return <span className="text-gray-600">{JSON.stringify(value)}</span>;
}
