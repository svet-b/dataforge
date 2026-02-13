import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePipelineStore } from '@/stores/pipeline';
import { debounce } from '@/utils/debounce';
import SqlEditor from './SqlEditor';

interface QueryEditorProps {
  pipelineId: string;
  onRun: () => void;
  onSqlRef?: (setter: (sql: string) => void) => void;
}

export default function QueryEditor({ pipelineId, onRun, onSqlRef }: QueryEditorProps) {
  const pipelineQuery = usePipelineStore((s) => s.pipeline?.query ?? '');
  const updatePipelineQuery = usePipelineStore((s) => s.updatePipelineQuery);
  const [queryValue, setQueryValue] = useState(pipelineQuery);
  const queryValueRef = useRef(queryValue);
  queryValueRef.current = queryValue;

  // Sync from store when pipeline loads
  useEffect(() => {
    if (pipelineQuery !== queryValueRef.current) {
      setQueryValue(pipelineQuery);
    }
  }, [pipelineQuery]);

  const saveQuery = useMemo(
    () =>
      debounce((...args: unknown[]) => {
        updatePipelineQuery(pipelineId, args[0] as string);
      }, 800),
    [pipelineId, updatePipelineQuery],
  );

  const handleQueryChange = useCallback(
    (newValue: string) => {
      setQueryValue(newValue);
      saveQuery(newValue);
    },
    [saveQuery],
  );

  const handleRun = useCallback(() => {
    saveQuery.cancel();
    updatePipelineQuery(pipelineId, queryValueRef.current).then(() => {
      onRun();
    });
  }, [pipelineId, updatePipelineQuery, onRun, saveQuery]);

  // Expose setSql to parent
  useEffect(() => {
    onSqlRef?.((sql: string) => {
      setQueryValue(sql);
      saveQuery(sql);
    });
  }, [onSqlRef, saveQuery]);

  return (
    <div className="flex h-full flex-col" data-testid="query-editor">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">SQL Query</h3>
        <span className="text-xs text-gray-400">
          {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to run
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <SqlEditor
          value={queryValue}
          onChange={handleQueryChange}
          onRunPreview={handleRun}
          placeholder="SELECT * FROM my_table..."
        />
      </div>
    </div>
  );
}
