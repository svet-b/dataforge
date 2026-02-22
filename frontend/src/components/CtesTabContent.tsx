import { useMemo } from 'react';
import { useCteInspectionStore } from '@/stores/cteInspection';
import DataTable from '@/components/DataTable';
import { Loader2 } from 'lucide-react';

export default function CtesTabContent({ workflowId: _workflowId }: { workflowId: string }) {
  const cteState = useCteInspectionStore();

  const selectedCteData = useMemo(
    () => cteState.ctes.find((c) => c.name === cteState.selectedCte) ?? null,
    [cteState.ctes, cteState.selectedCte],
  );

  if (cteState.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Inspecting CTEs...
      </div>
    );
  }

  if (cteState.error) {
    return <div className="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{cteState.error}</div>;
  }

  if (cteState.ctes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        No CTEs found in the query.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* CTE pills */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-3 py-1.5">
        {cteState.ctes.map((cte) => (
          <button
            key={cte.name}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              cteState.selectedCte === cte.name
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => cteState.selectCte(cte.name)}
          >
            {cte.name}
            <span className="ml-1 text-gray-400">{cte.row_count}</span>
          </button>
        ))}
      </div>
      {selectedCteData && (
        <div className="min-h-0 flex-1">
          <DataTable data={selectedCteData.data} schema={selectedCteData.schema_info} />
        </div>
      )}
    </div>
  );
}
