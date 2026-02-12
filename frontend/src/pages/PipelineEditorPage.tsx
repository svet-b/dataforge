import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePipelineStore } from '@/stores/pipeline';
import { useRunsStore } from '@/stores/runs';
import { useResultsStore } from '@/stores/results';
import { useCteInspectionStore } from '@/stores/cteInspection';
import { useSourcePreviewStore } from '@/stores/sourcePreview';
import Toolbar from '@/components/Toolbar';
import SourceList from '@/components/SourceList';
import SourceConfigPanel from '@/components/SourceConfigPanel';
import QueryEditor from '@/components/QueryEditor';
import ResultsPanel from '@/components/ResultsPanel';
import ParameterModal from '@/components/ParameterModal';
import RunDialog from '@/components/RunDialog';
import LlmChat from '@/components/LlmChat';

type DragTarget = 'left-divider' | 'right-divider' | 'middle-divider' | null;

export default function PipelineEditorPage() {
  const { id: pipelineId } = useParams<{ id: string }>();

  const pipeline = usePipelineStore((s) => s.pipeline);
  const loading = usePipelineStore((s) => s.loading);
  const error = usePipelineStore((s) => s.error);
  const selectedSourceId = usePipelineStore((s) => s.selectedSourceId);
  const loadPipeline = usePipelineStore((s) => s.loadPipeline);
  const resetPipeline = usePipelineStore((s) => s.reset);
  const runPipeline = usePipelineStore((s) => s.runPipeline);
  const resetRuns = useRunsStore((s) => s.reset);
  const loadRuns = useRunsStore((s) => s.loadRuns);
  const clearResults = useResultsStore((s) => s.clear);
  const setResultsLoading = useResultsStore((s) => s.setLoading);
  const setResults = useResultsStore((s) => s.setResults);
  const setResultsError = useResultsStore((s) => s.setError);
  const resetCte = useCteInspectionStore((s) => s.reset);
  const resetSourcePreview = useSourcePreviewStore((s) => s.reset);

  const [showParamModal, setShowParamModal] = useState(false);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [resultsTab, setResultsTab] = useState('results');

  // Resizable panel state
  const [leftColWidth, setLeftColWidth] = useState(280);
  const [rightColWidth, setRightColWidth] = useState(420);
  const [sourcesHeight, setSourcesHeight] = useState(220);

  // Drag state
  const dragRef = useRef<{ target: DragTarget; startPos: number; startSize: number }>({
    target: null,
    startPos: 0,
    startSize: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  // SQL setter ref for LlmChat -> QueryEditor communication
  const sqlSetterRef = useRef<((sql: string) => void) | null>(null);

  const selectedSource = useMemo(
    () => pipeline?.sources.find((s) => s.id === selectedSourceId) ?? null,
    [pipeline?.sources, selectedSourceId],
  );

  useEffect(() => {
    if (pipelineId) loadPipeline(pipelineId);
    return () => {
      resetPipeline();
      resetRuns();
      clearResults();
      resetCte();
      resetSourcePreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId]);

  // Keyboard shortcut
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  function onDividerPointerDown(target: DragTarget, e: React.PointerEvent) {
    dragRef.current = {
      target,
      startPos: target === 'middle-divider' ? e.clientY : e.clientX,
      startSize: target === 'left-divider' ? leftColWidth
        : target === 'right-divider' ? rightColWidth
        : sourcesHeight,
    };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDividerPointerMove(e: React.PointerEvent) {
    const { target, startPos, startSize } = dragRef.current;
    if (!target) return;
    if (target === 'left-divider') {
      const delta = e.clientX - startPos;
      setLeftColWidth(Math.max(180, Math.min(480, startSize + delta)));
    } else if (target === 'right-divider') {
      const delta = startPos - e.clientX;
      setRightColWidth(Math.max(200, Math.min(700, startSize + delta)));
    } else if (target === 'middle-divider') {
      const delta = e.clientY - startPos;
      setSourcesHeight(Math.max(80, Math.min(500, startSize + delta)));
    }
  }

  function onDividerPointerUp() {
    dragRef.current.target = null;
    setIsDragging(false);
  }

  function handleRun() {
    const params = pipeline?.parameters ?? [];
    if (params.length > 0) {
      setShowRunDialog(true);
    } else {
      executeRun();
    }
  }

  async function executeRun() {
    if (!pipelineId) return;
    setResultsLoading();
    setResultsTab('results');
    const result = await runPipeline(pipelineId);
    if (result) {
      setResults(result);
    } else {
      setResultsError('Run failed');
    }
    await loadRuns(pipelineId);
  }

  const handleSqlGenerated = useCallback((sql: string) => {
    sqlSetterRef.current?.(sql);
  }, []);

  const handleSqlRef = useCallback((setter: (sql: string) => void) => {
    sqlSetterRef.current = setter;
  }, []);

  if (!pipelineId) return null;

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading pipeline...</div>;
  }

  if (error) {
    return <div className="flex h-screen items-center justify-center text-red-500">Error: {error}</div>;
  }

  if (!pipeline) return null;

  return (
    <div className="flex h-screen flex-col" data-testid="pipeline-editor">
      <Toolbar
        pipelineId={pipelineId}
        pipelineName={pipeline.name}
        onOpenParams={() => setShowParamModal(true)}
        onRun={handleRun}
      />

      <div className={`flex flex-1 overflow-hidden ${isDragging ? 'select-none' : ''}`}>
        {/* Left column: AI Chat */}
        <div className="flex shrink-0 flex-col bg-white" style={{ width: leftColWidth }}>
          <LlmChat pipelineId={pipelineId} onSqlGenerated={handleSqlGenerated} />
        </div>

        {/* Left divider */}
        <div
          className="flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-gray-100 hover:bg-gray-300"
          onPointerDown={(e) => onDividerPointerDown('left-divider', e)}
          onPointerMove={onDividerPointerMove}
          onPointerUp={onDividerPointerUp}
        >
          <div className="h-8 w-0.5 rounded-full bg-gray-400" />
        </div>

        {/* Middle column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Sources pane */}
          <div className="shrink-0 overflow-y-auto bg-white" style={{ height: sourcesHeight }}>
            <SourceList pipelineId={pipelineId} />
            {selectedSource && (
              <SourceConfigPanel pipelineId={pipelineId} source={selectedSource} />
            )}
          </div>

          {/* Middle divider */}
          <div
            className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-gray-100 hover:bg-gray-300"
            onPointerDown={(e) => onDividerPointerDown('middle-divider', e)}
            onPointerMove={onDividerPointerMove}
            onPointerUp={onDividerPointerUp}
          >
            <div className="h-0.5 w-8 rounded-full bg-gray-400" />
          </div>

          {/* SQL Editor pane */}
          <div className="flex flex-1 flex-col overflow-hidden bg-white">
            <QueryEditor pipelineId={pipelineId} onRun={handleRun} onSqlRef={handleSqlRef} />
          </div>
        </div>

        {/* Right divider */}
        <div
          className="flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-gray-100 hover:bg-gray-300"
          onPointerDown={(e) => onDividerPointerDown('right-divider', e)}
          onPointerMove={onDividerPointerMove}
          onPointerUp={onDividerPointerUp}
        >
          <div className="h-8 w-0.5 rounded-full bg-gray-400" />
        </div>

        {/* Right column: Results */}
        <div className="flex shrink-0 flex-col bg-white" style={{ width: rightColWidth }}>
          <ResultsPanel pipelineId={pipelineId} activeTab={resultsTab} onTabChange={setResultsTab} />
        </div>
      </div>

      <ParameterModal
        pipelineId={pipelineId}
        parameters={pipeline.parameters ?? []}
        open={showParamModal}
        onClose={() => setShowParamModal(false)}
      />

      <RunDialog
        pipelineId={pipelineId}
        parameters={pipeline.parameters ?? []}
        open={showRunDialog}
        onClose={() => setShowRunDialog(false)}
        onRunComplete={() => setResultsTab('results')}
      />
    </div>
  );
}
