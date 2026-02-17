import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkflowStore } from '@/stores/workflow';
import { useRunsStore } from '@/stores/runs';
import { useResultsStore } from '@/stores/results';
import { useCteInspectionStore } from '@/stores/cteInspection';
import { useSourcePreviewStore } from '@/stores/sourcePreview';
import Toolbar from '@/components/Toolbar';
import ScreenSidebar, { type Screen } from '@/components/ScreenSidebar';
import SourceScreen from '@/components/screens/SourceScreen';
import ValidateScreen from '@/components/screens/ValidateScreen';
import AnalyzeScreen from '@/components/screens/AnalyzeScreen';
import ExecuteScreen from '@/components/screens/ExecuteScreen';
import ParameterModal from '@/components/ParameterModal';
import RunDialog from '@/components/RunDialog';

export default function WorkflowEditorPage() {
  const { id: workflowId } = useParams<{ id: string }>();

  const workflow = useWorkflowStore((s) => s.workflow);
  const loading = useWorkflowStore((s) => s.loading);
  const error = useWorkflowStore((s) => s.error);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const resetWorkflow = useWorkflowStore((s) => s.reset);
  const runWorkflow = useWorkflowStore((s) => s.runWorkflow);
  const resetRuns = useRunsStore((s) => s.reset);
  const loadRuns = useRunsStore((s) => s.loadRuns);
  const clearResults = useResultsStore((s) => s.clear);
  const setResultsLoading = useResultsStore((s) => s.setLoading);
  const setResults = useResultsStore((s) => s.setResults);
  const setResultsError = useResultsStore((s) => s.setError);
  const resetCte = useCteInspectionStore((s) => s.reset);
  const resetSourcePreview = useSourcePreviewStore((s) => s.reset);

  const [activeScreen, setActiveScreen] = useState<Screen>('source');
  const [showParamModal, setShowParamModal] = useState(false);
  const [showRunDialog, setShowRunDialog] = useState(false);

  useEffect(() => {
    if (workflowId) loadWorkflow(workflowId);
    return () => {
      resetWorkflow();
      resetRuns();
      clearResults();
      resetCte();
      resetSourcePreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Keyboard shortcut: prevent default Cmd+S
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  function handleRun() {
    const params = workflow?.parameters ?? [];
    if (params.length > 0) {
      setShowRunDialog(true);
    } else {
      executeRun();
    }
  }

  async function executeRun() {
    if (!workflowId) return;
    setResultsLoading();
    // Switch to analyze screen to show results
    if (activeScreen !== 'analyze') setActiveScreen('analyze');
    const result = await runWorkflow(workflowId);
    if (result) {
      setResults(result);
    } else {
      setResultsError('Run failed');
    }
    await loadRuns(workflowId);
  }

  if (!workflowId) return null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading workflow...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-red-500">Error: {error}</div>
    );
  }

  if (!workflow) return null;

  return (
    <div className="flex h-screen flex-col" data-testid="workflow-editor">
      <Toolbar
        workflowId={workflowId}
        workflowName={workflow.name}
        onOpenParams={() => setShowParamModal(true)}
        onRun={handleRun}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ScreenSidebar activeScreen={activeScreen} onScreenChange={setActiveScreen} />

        <div className="min-w-0 flex-1 overflow-hidden">
          {activeScreen === 'source' && <SourceScreen workflowId={workflowId} />}
          {activeScreen === 'validate' && <ValidateScreen />}
          {activeScreen === 'analyze' && (
            <AnalyzeScreen workflowId={workflowId} onRun={handleRun} />
          )}
          {activeScreen === 'execute' && <ExecuteScreen workflowId={workflowId} />}
        </div>
      </div>

      <ParameterModal
        workflowId={workflowId}
        parameters={workflow.parameters ?? []}
        open={showParamModal}
        onClose={() => setShowParamModal(false)}
      />

      <RunDialog
        workflowId={workflowId}
        parameters={workflow.parameters ?? []}
        open={showRunDialog}
        onClose={() => setShowRunDialog(false)}
        onRunComplete={() => setActiveScreen('analyze')}
      />
    </div>
  );
}
