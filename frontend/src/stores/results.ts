import { create } from 'zustand';
import type { SchemaColumn, RunResponse } from '@/types';

interface ResultsState {
  loading: boolean;
  data: Record<string, unknown>[];
  schema: SchemaColumn[];
  rowCount: number | null;
  runId: string | null;
  error: string | null;
  durationMs: number | null;
  setLoading: () => void;
  setResults: (result: RunResponse) => void;
  setError: (msg: string) => void;
  clear: () => void;
}

const initial = {
  loading: false,
  data: [] as Record<string, unknown>[],
  schema: [] as SchemaColumn[],
  rowCount: null as number | null,
  runId: null as string | null,
  error: null as string | null,
  durationMs: null as number | null,
};

export const useResultsStore = create<ResultsState>((set) => ({
  ...initial,

  setLoading: () => set({ ...initial, loading: true }),

  setResults: (result) =>
    set({
      loading: false,
      data: (result.data as Record<string, unknown>[]) ?? [],
      schema: result.schema_info ?? [],
      rowCount: result.row_count,
      runId: result.run_id,
      error: result.status === 'success' ? null : (result.error?.message ?? 'Unknown error'),
      durationMs: result.duration_ms,
    }),

  setError: (msg) => set({ ...initial, error: msg }),

  clear: () => set(initial),
}));
