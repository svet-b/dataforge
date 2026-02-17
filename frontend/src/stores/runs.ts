import { create } from 'zustand';
import type { RunHistorySummary, RunHistoryDetail } from '@/types';
import { api, ApiError } from '@/api/client';

interface RunsState {
  runs: RunHistorySummary[];
  expandedRun: RunHistoryDetail | null;
  loading: boolean;
  loadRuns: (workflowId: string) => Promise<void>;
  loadRunDetail: (workflowId: string, runId: string) => Promise<void>;
  reset: () => void;
}

export const useRunsStore = create<RunsState>((set) => ({
  runs: [],
  expandedRun: null,
  loading: false,

  loadRuns: async (workflowId) => {
    set({ loading: true });
    try {
      const runs = await api.runs.list(workflowId);
      set({ runs, expandedRun: null, loading: false });
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
      console.error('Failed to load runs:', msg);
      set({ loading: false });
    }
  },

  loadRunDetail: async (workflowId, runId) => {
    try {
      const detail = await api.runs.get(workflowId, runId);
      set({ expandedRun: detail });
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
      console.error('Failed to load run detail:', msg);
    }
  },

  reset: () => set({ runs: [], expandedRun: null, loading: false }),
}));
