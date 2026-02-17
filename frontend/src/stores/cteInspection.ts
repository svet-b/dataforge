import { create } from 'zustand';
import { api } from '@/api/client';
import type { CTEResult } from '@/types';

interface CTEInspectionState {
  loading: boolean;
  ctes: CTEResult[];
  selectedCte: string | null;
  error: string | null;
  durationMs: number | null;
  cachedForRunId: string | null;
  loadCteInspection: (workflowId: string, runId: string | null, parameters?: Record<string, unknown>) => Promise<void>;
  selectCte: (name: string) => void;
  reset: () => void;
}

const initial = {
  loading: false,
  ctes: [] as CTEResult[],
  selectedCte: null as string | null,
  error: null as string | null,
  durationMs: null as number | null,
  cachedForRunId: null as string | null,
};

export const useCteInspectionStore = create<CTEInspectionState>((set) => ({
  ...initial,

  loadCteInspection: async (workflowId, runId, parameters = {}) => {
    set({ ...initial, loading: true });
    try {
      const result = await api.execution.inspectCtes(workflowId, { parameters });
      if (result.status === 'success') {
        set({
          loading: false,
          ctes: result.ctes,
          selectedCte: result.ctes.length > 0 ? result.ctes[0].name : null,
          error: null,
          durationMs: result.duration_ms,
          cachedForRunId: runId,
        });
      } else {
        set({ ...initial, error: result.error?.message ?? 'CTE inspection failed' });
      }
    } catch (e) {
      set({ ...initial, error: e instanceof Error ? e.message : 'CTE inspection failed' });
    }
  },

  selectCte: (name) => set({ selectedCte: name }),

  reset: () => set(initial),
}));
