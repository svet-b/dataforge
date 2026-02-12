import { create } from 'zustand';
import { api, ApiError } from '@/api/client';
import type {
  PipelineDetail,
  PipelineParameter,
  SourceResponse,
  SourceType,
} from '@/types';
import { addToast } from './toasts';

interface PipelineState {
  pipeline: PipelineDetail | null;
  loading: boolean;
  error: string | null;
  selectedSourceId: string | null;
}

function errorMsg(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return String(e);
}

interface PipelineActions {
  loadPipeline: (id: string) => Promise<void>;
  addSource: (pipelineId: string, type: SourceType, tableName: string) => Promise<SourceResponse | null>;
  updateSource: (pipelineId: string, sourceId: string, data: { table_name?: string; config?: Record<string, unknown> }) => Promise<void>;
  deleteSource: (pipelineId: string, sourceId: string) => Promise<void>;
  selectSource: (sourceId: string | null) => void;
  updatePipelineName: (pipelineId: string, name: string) => Promise<void>;
  updatePipelineQuery: (pipelineId: string, query: string) => Promise<void>;
  updatePipelineParams: (pipelineId: string, parameters: PipelineParameter[]) => Promise<void>;
  runPipeline: (pipelineId: string, parameters?: Record<string, unknown>) => Promise<import('@/types').RunResponse | null>;
  reset: () => void;
}

export const usePipelineStore = create<PipelineState & PipelineActions>((set, get) => ({
  pipeline: null,
  loading: false,
  error: null,
  selectedSourceId: null,

  loadPipeline: async (id) => {
    set({ loading: true, error: null });
    try {
      const pipeline = await api.pipelines.get(id);
      set({ pipeline, loading: false, error: null, selectedSourceId: null });
    } catch (e) {
      set({ loading: false, error: errorMsg(e) });
    }
  },

  addSource: async (pipelineId, type, tableName) => {
    try {
      const source = await api.sources.create(pipelineId, {
        type,
        table_name: tableName,
        config: {},
      });
      set((s) => {
        if (!s.pipeline) return s;
        return {
          pipeline: { ...s.pipeline, sources: [...s.pipeline.sources, source] },
          selectedSourceId: source.id,
        };
      });
      return source;
    } catch (e) {
      addToast(errorMsg(e), 'error');
      return null;
    }
  },

  updateSource: async (pipelineId, sourceId, data) => {
    try {
      const updated = await api.sources.update(pipelineId, sourceId, data);
      set((s) => {
        if (!s.pipeline) return s;
        return {
          pipeline: {
            ...s.pipeline,
            sources: s.pipeline.sources.map((src) => (src.id === sourceId ? updated : src)),
          },
        };
      });
    } catch (e) {
      addToast(errorMsg(e), 'error');
    }
  },

  deleteSource: async (pipelineId, sourceId) => {
    try {
      await api.sources.delete(pipelineId, sourceId);
      set((s) => {
        if (!s.pipeline) return s;
        return {
          pipeline: {
            ...s.pipeline,
            sources: s.pipeline.sources.filter((src) => src.id !== sourceId),
          },
          selectedSourceId: s.selectedSourceId === sourceId ? null : s.selectedSourceId,
        };
      });
    } catch (e) {
      addToast(errorMsg(e), 'error');
    }
  },

  selectSource: (sourceId) => {
    set({ selectedSourceId: sourceId });
  },

  updatePipelineName: async (pipelineId, name) => {
    try {
      const updated = await api.pipelines.update(pipelineId, { name });
      set((s) => {
        if (!s.pipeline) return s;
        return { pipeline: { ...s.pipeline, name: updated.name } };
      });
      addToast('Pipeline name saved', 'success');
    } catch (e) {
      addToast(errorMsg(e), 'error');
    }
  },

  updatePipelineQuery: async (pipelineId, query) => {
    // Update store optimistically
    set((s) => {
      if (!s.pipeline) return s;
      return { pipeline: { ...s.pipeline, query } };
    });
    try {
      await api.pipelines.update(pipelineId, { query });
    } catch (e) {
      addToast(errorMsg(e), 'error');
    }
  },

  updatePipelineParams: async (pipelineId, parameters) => {
    try {
      const updated = await api.pipelines.update(pipelineId, { parameters });
      set((s) => {
        if (!s.pipeline) return s;
        return { pipeline: { ...s.pipeline, parameters: updated.parameters ?? [] } };
      });
      addToast('Parameters saved', 'success');
    } catch (e) {
      addToast(errorMsg(e), 'error');
    }
  },

  runPipeline: async (pipelineId, parameters = {}) => {
    try {
      const result = await api.execution.run(pipelineId, { parameters });
      if (result.status !== 'success') {
        addToast(`Run failed: ${result.error?.message ?? 'Unknown error'}`, 'error');
      }
      return result;
    } catch (e) {
      addToast(errorMsg(e), 'error');
      return null;
    }
  },

  reset: () => {
    set({ pipeline: null, loading: false, error: null, selectedSourceId: null });
  },
}));
