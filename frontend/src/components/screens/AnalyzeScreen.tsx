import { useCallback, useMemo, useRef, useState } from 'react';
import { useResultsStore } from '@/stores/results';
import { useCteInspectionStore } from '@/stores/cteInspection';
import LlmChat from '@/components/LlmChat';
import QueryEditor from '@/components/QueryEditor';
import DataTable from '@/components/DataTable';
import ResultsChart from '@/components/ResultsChart';
import { Loader2 } from 'lucide-react';

interface AnalyzeScreenProps {
  workflowId: string;
  onRun: () => void;
}

type DataTab = 'results' | 'ctes';

export default function AnalyzeScreen({ workflowId, onRun }: AnalyzeScreenProps) {
  const results = useResultsStore();
  const cteState = useCteInspectionStore();

  const [dataTab, setDataTab] = useState<DataTab>('results');

  // Draggable dividers
  const [hSplit, setHSplit] = useState(50); // horizontal split % (left/right)
  const [vSplitLeft, setVSplitLeft] = useState(50); // vertical split % (top/bottom in left col)
  const [vSplitRight, setVSplitRight] = useState(60); // vertical split % (top/bottom in right col)

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    type: 'h' | 'vl' | 'vr';
    startPos: number;
    startValue: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // SQL setter ref for LlmChat -> QueryEditor communication
  const sqlSetterRef = useRef<((sql: string) => void) | null>(null);

  const handleSqlGenerated = useCallback((sql: string) => {
    sqlSetterRef.current?.(sql);
  }, []);

  const handleSqlRef = useCallback((setter: (sql: string) => void) => {
    sqlSetterRef.current = setter;
  }, []);

  // Load CTEs when switching to CTE tab
  const handleDataTabChange = useCallback(
    (tab: DataTab) => {
      setDataTab(tab);
      if (tab === 'ctes' && results.runId !== cteState.cachedForRunId && !cteState.loading) {
        cteState.loadCteInspection(workflowId, results.runId);
      }
    },
    [workflowId, results.runId, cteState],
  );

  // Current data for the chart (from results or selected CTE)
  const selectedCteData = useMemo(
    () => cteState.ctes.find((c) => c.name === cteState.selectedCte) ?? null,
    [cteState.ctes, cteState.selectedCte],
  );

  const chartData = dataTab === 'results' ? results.data : (selectedCteData?.data ?? []);
  const chartSchema =
    dataTab === 'results' ? results.schema : (selectedCteData?.schema_info ?? []);

  // Drag handlers
  function onDragStart(type: 'h' | 'vl' | 'vr', e: React.PointerEvent) {
    const pos = type === 'h' ? e.clientX : e.clientY;
    dragRef.current = { type, startPos: pos, startValue: type === 'h' ? hSplit : type === 'vl' ? vSplitLeft : vSplitRight };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { type } = dragRef.current;

    if (type === 'h') {
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setHSplit(Math.max(20, Math.min(80, pct)));
    } else if (type === 'vl') {
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setVSplitLeft(Math.max(15, Math.min(85, pct)));
    } else {
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setVSplitRight(Math.max(15, Math.min(85, pct)));
    }
  }

  function onDragEnd() {
    dragRef.current = null;
    setIsDragging(false);
  }

  return (
    <div
      ref={containerRef}
      className={`flex h-full overflow-hidden ${isDragging ? 'select-none' : ''}`}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
    >
      {/* Left column: AI Chat + SQL Editor */}
      <div className="flex shrink-0 flex-col overflow-hidden" style={{ width: `${hSplit}%` }}>
        {/* Top-left: AI Chat */}
        <div className="flex flex-col overflow-hidden bg-white" style={{ height: `${vSplitLeft}%` }}>
          <LlmChat workflowId={workflowId} onSqlGenerated={handleSqlGenerated} />
        </div>

        {/* Left vertical divider */}
        <div
          className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-gray-100 hover:bg-gray-300"
          onPointerDown={(e) => onDragStart('vl', e)}
        >
          <div className="h-0.5 w-8 rounded-full bg-gray-400" />
        </div>

        {/* Bottom-left: SQL Editor */}
        <div
          className="flex flex-col overflow-hidden bg-white"
          style={{ height: `${100 - vSplitLeft}%` }}
        >
          <QueryEditor workflowId={workflowId} onRun={onRun} onSqlRef={handleSqlRef} />
        </div>
      </div>

      {/* Horizontal divider */}
      <div
        className="flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-gray-100 hover:bg-gray-300"
        onPointerDown={(e) => onDragStart('h', e)}
      >
        <div className="h-8 w-0.5 rounded-full bg-gray-400" />
      </div>

      {/* Right column: Data tables + Chart */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top-right: Results / CTEs data table */}
        <div
          className="flex flex-col overflow-hidden bg-white"
          style={{ height: `${vSplitRight}%` }}
        >
          {/* Tab bar */}
          <div className="flex shrink-0 items-center border-b border-gray-200 bg-white">
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                dataTab === 'results'
                  ? 'border-b-2 border-blue-500 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => handleDataTabChange('results')}
            >
              Results
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                dataTab === 'ctes'
                  ? 'border-b-2 border-blue-500 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => handleDataTabChange('ctes')}
            >
              Intermediate CTEs
            </button>

            {/* Results metadata */}
            {dataTab === 'results' && results.data.length > 0 && (
              <span className="ml-auto pr-3 text-xs text-gray-400">
                {results.data.length} of {results.rowCount ?? results.data.length} rows
                {results.durationMs != null && ` · ${results.durationMs}ms`}
              </span>
            )}
            {dataTab === 'ctes' && cteState.durationMs != null && (
              <span className="ml-auto pr-3 text-xs text-gray-400">{cteState.durationMs}ms</span>
            )}
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-auto">
            {dataTab === 'results' ? (
              <ResultsTabContent />
            ) : (
              <CtesTabContent workflowId={workflowId} />
            )}
          </div>
        </div>

        {/* Right vertical divider */}
        <div
          className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-gray-100 hover:bg-gray-300"
          onPointerDown={(e) => onDragStart('vr', e)}
        >
          <div className="h-0.5 w-8 rounded-full bg-gray-400" />
        </div>

        {/* Bottom-right: Chart */}
        <div
          className="flex flex-col overflow-hidden bg-white"
          style={{ height: `${100 - vSplitRight}%` }}
        >
          {chartData.length > 0 ? (
            <ResultsChart data={chartData} schema={chartSchema} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Run a query to see charts
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsTabContent() {
  const results = useResultsStore();

  if (results.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Running query...
      </div>
    );
  }

  if (results.error) {
    return <div className="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{results.error}</div>;
  }

  if (results.data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        No results yet. Click Run to execute the workflow.
      </div>
    );
  }

  return <DataTable data={results.data} schema={results.schema} />;
}

function CtesTabContent({ workflowId }: { workflowId: string }) {
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
