import { useEffect, useMemo, useState } from 'react';
import { useResultsStore } from '@/stores/results';
import { useRunsStore } from '@/stores/runs';
import { useCteInspectionStore } from '@/stores/cteInspection';
import { useSourcePreviewStore } from '@/stores/sourcePreview';
import { api } from '@/api/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DataViewer from './DataViewer';
import { ChevronDown, Loader2 } from 'lucide-react';

interface ResultsPanelProps {
  pipelineId: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function ResultsPanel({ pipelineId, activeTab, onTabChange }: ResultsPanelProps) {
  // Results
  const results = useResultsStore();

  // Runs
  const runs = useRunsStore((s) => s.runs);
  const runsLoading = useRunsStore((s) => s.loading);
  const expandedRun = useRunsStore((s) => s.expandedRun);
  const loadRuns = useRunsStore((s) => s.loadRuns);
  const loadRunDetail = useRunsStore((s) => s.loadRunDetail);

  // CTE inspection
  const cteState = useCteInspectionStore();

  // Source preview
  const sourcePreviewState = useSourcePreviewStore();

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Load data when switching tabs
  useEffect(() => {
    if (activeTab === 'history') {
      loadRuns(pipelineId);
    }
    if (activeTab === 'inputs' && !sourcePreviewState.cached && !sourcePreviewState.loading) {
      sourcePreviewState.loadSourcePreview(pipelineId);
    }
    if (activeTab === 'ctes' && results.runId !== cteState.cachedForRunId && !cteState.loading) {
      cteState.loadCteInspection(pipelineId, results.runId);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(runId: string) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
    } else {
      setExpandedRunId(runId);
      loadRunDetail(pipelineId, runId);
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  function downloadUrl(runId: string, format: 'csv' | 'json'): string {
    return api.download.url(pipelineId, runId, format);
  }

  const selectedSourceData = useMemo(
    () => sourcePreviewState.sources.find((s) => s.name === sourcePreviewState.selectedSource) ?? null,
    [sourcePreviewState.sources, sourcePreviewState.selectedSource],
  );

  const selectedCteData = useMemo(
    () => cteState.ctes.find((c) => c.name === cteState.selectedCte) ?? null,
    [cteState.ctes, cteState.selectedCte],
  );

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="flex h-full flex-col">
      <TabsList>
        <TabsTrigger value="inputs" data-testid="tab-inputs">Inputs</TabsTrigger>
        <TabsTrigger value="ctes" data-testid="tab-ctes">Intermediate CTEs</TabsTrigger>
        <TabsTrigger value="results" data-testid="tab-results">Results</TabsTrigger>
        <TabsTrigger value="history" data-testid="tab-history" className="ml-auto">Run History</TabsTrigger>
      </TabsList>

      {/* Inputs */}
      <TabsContent value="inputs">
        {sourcePreviewState.loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading sources...
          </div>
        ) : sourcePreviewState.error ? (
          <div className="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{sourcePreviewState.error}</div>
        ) : sourcePreviewState.sources.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">No sources configured.</div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-3 py-1.5">
              {sourcePreviewState.sources.map((src) => (
                <button
                  key={src.name}
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    sourcePreviewState.selectedSource === src.name
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  onClick={() => sourcePreviewState.selectSource(src.name)}
                >
                  {src.name}
                  <span className="ml-1 text-gray-400">{src.row_count}</span>
                </button>
              ))}
              {sourcePreviewState.durationMs != null && (
                <span className="ml-auto shrink-0 text-xs text-gray-400">{sourcePreviewState.durationMs}ms</span>
              )}
            </div>
            {selectedSourceData && (
              selectedSourceData.error ? (
                <div className="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{selectedSourceData.error}</div>
              ) : (
                <DataViewer key={sourcePreviewState.selectedSource} data={selectedSourceData.data} schema={selectedSourceData.schema_info} />
              )
            )}
          </>
        )}
      </TabsContent>

      {/* CTEs */}
      <TabsContent value="ctes">
        {cteState.loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Inspecting CTEs...
          </div>
        ) : cteState.error ? (
          <div className="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{cteState.error}</div>
        ) : cteState.ctes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">No CTEs found in the query.</div>
        ) : (
          <>
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
              {cteState.durationMs != null && (
                <span className="ml-auto shrink-0 text-xs text-gray-400">{cteState.durationMs}ms</span>
              )}
            </div>
            {selectedCteData && (
              <DataViewer key={cteState.selectedCte} data={selectedCteData.data} schema={selectedCteData.schema_info} />
            )}
          </>
        )}
      </TabsContent>

      {/* Results */}
      <TabsContent value="results">
        {results.loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Running query...
          </div>
        ) : results.error ? (
          <div className="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{results.error}</div>
        ) : results.data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No results yet. Click Run to execute the pipeline.
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 py-1">
              <span className="text-xs text-gray-500">
                Showing {results.data.length} of {results.rowCount ?? results.data.length} rows
                {results.durationMs != null && ` \u00b7 ${results.durationMs}ms`}
              </span>
              {results.runId && (
                <div className="flex gap-1.5" data-testid="download-buttons">
                  <a
                    href={downloadUrl(results.runId, 'csv')}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    download
                  >
                    CSV
                  </a>
                  <a
                    href={downloadUrl(results.runId, 'json')}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    download
                  >
                    JSON
                  </a>
                </div>
              )}
            </div>
            <DataViewer data={results.data} schema={results.schema} />
          </>
        )}
      </TabsContent>

      {/* Run History */}
      <TabsContent value="history" className="overflow-y-auto">
        {runsLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading runs...</div>
        ) : runs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No runs yet. Click Run to execute the pipeline.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {runs.map((run) => (
              <div key={run.id}>
                <button
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => toggleExpand(run.id)}
                >
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                      run.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="flex-1 text-gray-700">{formatTime(run.started_at)}</span>
                  <span className="text-xs text-gray-500">{run.duration_ms}ms</span>
                  {run.row_count != null && (
                    <span className="text-xs text-gray-500">{run.row_count} rows</span>
                  )}
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-gray-400 transition-transform ${
                      expandedRunId === run.id ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {expandedRunId === run.id && expandedRun && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 text-xs">
                    {expandedRun.error && (
                      <div className="mb-2 space-y-1 rounded bg-red-50 p-2 text-red-600">
                        <div>{expandedRun.error.message}</div>
                        {expandedRun.error.sql && (
                          <pre className="mt-1 whitespace-pre-wrap rounded bg-red-100/50 p-1.5 font-mono text-red-700">
                            {expandedRun.error.sql}
                          </pre>
                        )}
                      </div>
                    )}

                    {Object.keys(expandedRun.parameters ?? {}).length > 0 && (
                      <div className="mb-2">
                        <span className="font-semibold text-gray-600">Parameters:</span>
                        <pre className="mt-0.5 rounded bg-white p-1.5 text-gray-700">
                          {JSON.stringify(expandedRun.parameters, null, 2)}
                        </pre>
                      </div>
                    )}

                    {run.status === 'success' && (
                      <div className="flex gap-2">
                        <a
                          href={downloadUrl(run.id, 'csv')}
                          className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                          download
                        >
                          Download CSV
                        </a>
                        <a
                          href={downloadUrl(run.id, 'json')}
                          className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                          download
                        >
                          Download JSON
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
