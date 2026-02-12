import { create } from 'zustand';
import { api } from '@/api/client';
import type { SourcePreviewResult } from '@/types';

interface SourcePreviewState {
  loading: boolean;
  sources: SourcePreviewResult[];
  selectedSource: string | null;
  error: string | null;
  durationMs: number | null;
  cached: boolean;
  loadSourcePreview: (pipelineId: string) => Promise<void>;
  selectSource: (name: string) => void;
  reset: () => void;
}

const initial = {
  loading: false,
  sources: [] as SourcePreviewResult[],
  selectedSource: null as string | null,
  error: null as string | null,
  durationMs: null as number | null,
  cached: false,
};

export const useSourcePreviewStore = create<SourcePreviewState>((set) => ({
  ...initial,

  loadSourcePreview: async (pipelineId) => {
    set({ ...initial, loading: true });
    try {
      const result = await api.execution.previewSources(pipelineId);
      set({
        loading: false,
        sources: result.sources,
        selectedSource: result.sources.length > 0 ? result.sources[0].name : null,
        error: null,
        durationMs: result.duration_ms,
        cached: true,
      });
    } catch (e) {
      set({ ...initial, error: e instanceof Error ? e.message : 'Failed to load sources' });
    }
  },

  selectSource: (name) => set({ selectedSource: name }),

  reset: () => set(initial),
}));
