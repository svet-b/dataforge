import { create } from 'zustand';
import { api, ApiError } from '@/api/client';
import type {
  WorkflowDetail,
  WorkflowParameter,
  SourceResponse,
  SourceType,
} from '@/types';
import { addToast } from './toasts';
import { useSourcePreviewStore } from './sourcePreview';

interface WorkflowState {
  workflow: WorkflowDetail | null;
  loading: boolean;
  error: string | null;
  selectedSourceId: string | null;
}

function errorMsg(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return String(e);
}

interface WorkflowActions {
  loadWorkflow: (id: string) => Promise<void>;
  addSource: (workflowId: string, type: SourceType, tableName: string) => Promise<SourceResponse | null>;
  updateSource: (workflowId: string, sourceId: string, data: { table_name?: string; config?: Record<string, unknown> }) => Promise<void>;
  deleteSource: (workflowId: string, sourceId: string) => Promise<void>;
  selectSource: (sourceId: string | null) => void;
  updateWorkflowName: (workflowId: string, name: string) => Promise<void>;
  updateWorkflowQuery: (workflowId: string, query: string) => Promise<void>;
  updateWorkflowParams: (workflowId: string, parameters: WorkflowParameter[]) => Promise<void>;
  runWorkflow: (workflowId: string, parameters?: Record<string, unknown>) => Promise<import('@/types').RunResponse | null>;
  reset: () => void;
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>((set, get) => ({
  workflow: null,
  loading: false,
  error: null,
  selectedSourceId: null,

  loadWorkflow: async (id) => {
    set({ loading: true, error: null });
    try {
      const workflow = await api.workflows.get(id);
      set({ workflow, loading: false, error: null, selectedSourceId: null });
    } catch (e) {
      set({ loading: false, error: errorMsg(e) });
    }
  },

  addSource: async (workflowId, type, tableName) => {
    try {
      const source = await api.sources.create(workflowId, {
        type,
        table_name: tableName,
        config: {},
      });
      set((s) => {
        if (!s.workflow) return s;
        return {
          workflow: { ...s.workflow, sources: [...s.workflow.sources, source] },
          selectedSourceId: source.id,
        };
      });
      return source;
    } catch (e) {
      addToast(errorMsg(e), 'error');
      return null;
    }
  },

  updateSource: async (workflowId, sourceId, data) => {
    try {
      const updated = await api.sources.update(workflowId, sourceId, data);
      set((s) => {
        if (!s.workflow) return s;
        return {
          workflow: {
            ...s.workflow,
            sources: s.workflow.sources.map((src) => (src.id === sourceId ? updated : src)),
          },
        };
      });
      useSourcePreviewStore.getState().reset();
    } catch (e) {
      addToast(errorMsg(e), 'error');
    }
  },

  deleteSource: async (workflowId, sourceId) => {
    try {
      await api.sources.delete(workflowId, sourceId);
      set((s) => {
        if (!s.workflow) return s;
        return {
          workflow: {
            ...s.workflow,
            sources: s.workflow.sources.filter((src) => src.id !== sourceId),
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

  updateWorkflowName: async (workflowId, name) => {
    try {
      const updated = await api.workflows.update(workflowId, { name });
      set((s) => {
        if (!s.workflow) return s;
        return { workflow: { ...s.workflow, name: updated.name } };
      });
      addToast('Workflow name saved', 'success');
    } catch (e) {
      addToast(errorMsg(e), 'error');
    }
  },

  updateWorkflowQuery: async (workflowId, query) => {
    // Update store optimistically
    set((s) => {
      if (!s.workflow) return s;
      return { workflow: { ...s.workflow, query } };
    });
    try {
      await api.workflows.update(workflowId, { query });
    } catch (e) {
      addToast(errorMsg(e), 'error');
    }
  },

  updateWorkflowParams: async (workflowId, parameters) => {
    try {
      const updated = await api.workflows.update(workflowId, { parameters });
      set((s) => {
        if (!s.workflow) return s;
        return { workflow: { ...s.workflow, parameters: updated.parameters ?? [] } };
      });
      addToast('Parameters saved', 'success');
    } catch (e) {
      addToast(errorMsg(e), 'error');
    }
  },

  runWorkflow: async (workflowId, parameters = {}) => {
    try {
      const result = await api.execution.run(workflowId, { parameters });
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
    set({ workflow: null, loading: false, error: null, selectedSourceId: null });
  },
}));
