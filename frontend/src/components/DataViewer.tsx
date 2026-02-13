import { useCallback, useRef, useState } from 'react';
import type { SchemaColumn } from '@/types';
import DataTable from './DataTable';
import ResultsChart from './ResultsChart';

interface DataViewerProps {
  data: Record<string, unknown>[];
  schema: SchemaColumn[];
}

export default function DataViewer({ data, schema }: DataViewerProps) {
  const [splitPercent, setSplitPercent] = useState(55);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.max(15, Math.min(85, pct)));
    }

    function onMouseUp() {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 flex-1 flex-col ${isDragging ? 'select-none' : ''}`}
    >
      {/* Top: Data table */}
      <div className="flex flex-col overflow-hidden" style={{ height: `${splitPercent}%` }}>
        <div className="min-h-0 flex-1">
          <DataTable data={data} schema={schema} />
        </div>
      </div>

      {/* Drag handle */}
      <div
        className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-gray-200 bg-gray-100 transition-colors hover:bg-gray-200"
        onMouseDown={onMouseDown}
        role="separator"
      >
        <div className="h-0.5 w-8 rounded-full bg-gray-400" />
      </div>

      {/* Bottom: Chart */}
      <div className="flex flex-col overflow-hidden" style={{ height: `${100 - splitPercent}%` }}>
        <ResultsChart data={data} schema={schema} />
      </div>
    </div>
  );
}
