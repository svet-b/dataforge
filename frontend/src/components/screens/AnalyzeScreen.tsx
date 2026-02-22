import { useCallback, useMemo, useRef, useState } from 'react';
import { useResultsStore } from '@/stores/results';
import { useCteInspectionStore } from '@/stores/cteInspection';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import LlmChat from '@/components/LlmChat';
import QueryEditor from '@/components/QueryEditor';
import ResultsTabContent from '@/components/ResultsTabContent';
import CtesTabContent from '@/components/CtesTabContent';
import ResultsChart from '@/components/ResultsChart';

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
          className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-gray-100 hover:bg-gray-200"
          onPointerDown={(e) => onDragStart('vl', e)}
        >
          <div className="h-0.5 w-8 rounded-full bg-gray-300" />
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
        className="flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-gray-100 hover:bg-gray-200"
        onPointerDown={(e) => onDragStart('h', e)}
      >
        <div className="h-8 w-0.5 rounded-full bg-gray-300" />
      </div>

      {/* Right column: Data tables + Chart */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top-right: Results / CTEs data table */}
        <Tabs
          value={dataTab}
          onValueChange={(v) => handleDataTabChange(v as DataTab)}
          className="flex flex-col overflow-hidden bg-white"
          style={{ height: `${vSplitRight}%` }}
        >
          <div className="flex shrink-0 items-center bg-white">
            <TabsList>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="ctes">Intermediate CTEs</TabsTrigger>
            </TabsList>

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

          <TabsContent value="results" className="min-h-0 overflow-auto">
            <ResultsTabContent />
          </TabsContent>
          <TabsContent value="ctes" className="min-h-0 overflow-auto">
            <CtesTabContent workflowId={workflowId} />
          </TabsContent>
        </Tabs>

        {/* Right vertical divider */}
        <div
          className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-gray-100 hover:bg-gray-200"
          onPointerDown={(e) => onDragStart('vr', e)}
        >
          <div className="h-0.5 w-8 rounded-full bg-gray-300" />
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
