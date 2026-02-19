import { useEffect, useMemo } from 'react';
import { useSourcePreviewStore } from '@/stores/sourcePreview';
import DataViewer from './DataViewer';
import { Loader2 } from 'lucide-react';

interface SourcePreviewProps {
  workflowId: string;
}

export default function SourcePreview({ workflowId }: SourcePreviewProps) {
  const state = useSourcePreviewStore();

  useEffect(() => {
    if (!state.cached && !state.loading) {
      state.loadSourcePreview(workflowId);
    }
  }, [workflowId, state.cached]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedData = useMemo(
    () => state.sources.find((s) => s.name === state.selectedSource) ?? null,
    [state.sources, state.selectedSource],
  );

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading sources...
      </div>
    );
  }

  if (state.error) {
    return <div className="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{state.error}</div>;
  }

  if (state.sources.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        No sources configured.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-3 py-1.5">
        {state.sources.map((src) => (
          <button
            key={src.name}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              state.selectedSource === src.name
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => state.selectSource(src.name)}
          >
            {src.name}
            <span className="ml-1 text-gray-400">{src.row_count}</span>
          </button>
        ))}
        {state.durationMs != null && (
          <span className="ml-auto shrink-0 text-xs text-gray-400">{state.durationMs}ms</span>
        )}
      </div>
      {selectedData &&
        (selectedData.error ? (
          <div className="m-3 rounded bg-red-50 p-3 text-sm text-red-600">
            {selectedData.error}
          </div>
        ) : (
          <DataViewer
            key={state.selectedSource}
            data={selectedData.data}
            schema={selectedData.schema_info}
          />
        ))}
    </div>
  );
}
