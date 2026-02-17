import { useCallback, useMemo, useRef, useState } from 'react';
import { useWorkflowStore } from '@/stores/workflow';
import SourceList from '@/components/SourceList';
import SourceConfigPanel from '@/components/SourceConfigPanel';
import SourcePreview from '@/components/SourcePreview';

interface SourceScreenProps {
  workflowId: string;
}

export default function SourceScreen({ workflowId }: SourceScreenProps) {
  const selectedSourceId = useWorkflowStore((s) => s.selectedSourceId);
  const workflow = useWorkflowStore((s) => s.workflow);

  const selectedSource = useMemo(
    () => workflow?.sources.find((s) => s.id === selectedSourceId) ?? null,
    [workflow?.sources, selectedSourceId],
  );

  const [leftWidth, setLeftWidth] = useState(360);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startWidth: leftWidth };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [leftWidth]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    setLeftWidth(Math.max(240, Math.min(600, dragRef.current.startWidth + delta)));
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  return (
    <div className={`flex h-full overflow-hidden ${isDragging ? 'select-none' : ''}`}>
      {/* Left: Source list + config */}
      <div className="flex shrink-0 flex-col overflow-y-auto bg-white" style={{ width: leftWidth }}>
        <SourceList workflowId={workflowId} />
        {selectedSource && <SourceConfigPanel workflowId={workflowId} source={selectedSource} />}
      </div>

      {/* Divider */}
      <div
        className="flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-gray-100 hover:bg-gray-200"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="h-8 w-0.5 rounded-full bg-gray-300" />
      </div>

      {/* Right: Source preview */}
      <div className="min-w-0 flex-1 overflow-hidden bg-white">
        <SourcePreview workflowId={workflowId} />
      </div>
    </div>
  );
}
