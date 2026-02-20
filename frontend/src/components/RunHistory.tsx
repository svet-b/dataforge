import { useEffect, useState } from 'react';
import { useRunsStore } from '@/stores/runs';
import { api } from '@/api/client';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { RunHistorySummary } from '@/types';
import ContentModal from './ContentModal';

interface RunHistoryProps {
  workflowId: string;
}

export default function RunHistory({ workflowId }: RunHistoryProps) {
  const runs = useRunsStore((s) => s.runs);
  const loading = useRunsStore((s) => s.loading);
  const expandedRun = useRunsStore((s) => s.expandedRun);
  const loadRuns = useRunsStore((s) => s.loadRuns);
  const loadRunDetail = useRunsStore((s) => s.loadRunDetail);

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [contentHash, setContentHash] = useState<string | null>(null);

  useEffect(() => {
    loadRuns(workflowId);
  }, [workflowId]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(runId: string) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
    } else {
      setExpandedRunId(runId);
      loadRunDetail(workflowId, runId);
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  function downloadUrl(runId: string, format: 'csv' | 'json'): string {
    return api.download.url(workflowId, runId, format);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading runs...
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        No runs yet. Click Run to execute the workflow.
      </div>
    );
  }

  const hashFields: { key: keyof RunHistorySummary; label: string }[] = [
    { key: 'query_hash', label: 'Query' },
    { key: 'source_config_hash', label: 'Sources' },
    { key: 'parameters_hash', label: 'Params' },
    { key: 'source_data_hash', label: 'Data' },
    { key: 'result_hash', label: 'Result' },
  ];

  return (
    <div className="divide-y divide-gray-100 overflow-y-auto">
      <ContentModal hash={contentHash} onClose={() => setContentHash(null)} />
      {runs.map((run, runIndex) => {
        const prevRun = runs[runIndex + 1] ?? null;
        return (
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
            <span className="text-xs text-gray-400">{run.duration_ms}ms</span>
            {run.row_count != null && (
              <span className="text-xs text-gray-400">{run.row_count} rows</span>
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
                <div className="mb-2 space-y-1 rounded bg-red-50 p-3 text-sm text-red-600">
                  <div>{expandedRun.error.message}</div>
                  {expandedRun.error.sql && (
                    <pre className="mt-1 whitespace-pre-wrap rounded bg-red-100/50 p-1.5 font-mono text-xs text-red-600">
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

              {expandedRun.query_hash && (
                <div className="mb-2">
                  <span className="font-semibold text-gray-600">Provenance:</span>
                  <div className="mt-0.5 space-y-0.5">
                    {hashFields.map(({ key, label }) => {
                      const hash = expandedRun[key] as string | null | undefined;
                      if (!hash) return null;
                      const prev = prevRun?.[key] as string | null | undefined;
                      const status = !prev ? 'new' : prev === hash ? 'same' : 'changed';
                      const clickable = key !== 'result_hash';
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className={
                            status === 'same' ? 'text-green-500' :
                            status === 'changed' ? 'text-amber-500' : 'text-gray-400'
                          }>
                            {status === 'same' ? '=' : status === 'changed' ? '~' : '+'}
                          </span>
                          <span className="w-14 font-medium text-gray-700">{label}</span>
                          <button
                            className={`font-mono ${clickable ? 'cursor-pointer text-blue-500 hover:text-blue-700 hover:underline' : 'cursor-default text-gray-400'}`}
                            title={hash}
                            onClick={() => clickable && setContentHash(hash)}
                            disabled={!clickable}
                          >
                            {hash.slice(0, 12)}
                          </button>
                          {status === 'changed' && (
                            <span className="text-amber-600">changed</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
        );
      })}
    </div>
  );
}
