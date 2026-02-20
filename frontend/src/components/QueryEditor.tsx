import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkflowStore } from '@/stores/workflow';
import { debounce } from '@/utils/debounce';
import { Clock } from 'lucide-react';
import SqlEditor from './SqlEditor';
import QueryHistory from './QueryHistory';

interface QueryEditorProps {
  workflowId: string;
  onRun: () => void;
  onSqlRef?: (setter: (sql: string) => void) => void;
}

export default function QueryEditor({ workflowId, onRun, onSqlRef }: QueryEditorProps) {
  const workflowQuery = useWorkflowStore((s) => s.workflow?.query ?? '');
  const updateWorkflowQuery = useWorkflowStore((s) => s.updateWorkflowQuery);
  const [queryValue, setQueryValue] = useState(workflowQuery);
  const queryValueRef = useRef(queryValue);
  queryValueRef.current = queryValue;

  // Sync from store when workflow loads
  useEffect(() => {
    if (workflowQuery !== queryValueRef.current) {
      setQueryValue(workflowQuery);
    }
  }, [workflowQuery]);

  const saveQuery = useMemo(
    () =>
      debounce((...args: unknown[]) => {
        updateWorkflowQuery(workflowId, args[0] as string);
      }, 800),
    [workflowId, updateWorkflowQuery],
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
    updateWorkflowQuery(workflowId, queryValueRef.current).then(() => {
      onRun();
    });
  }, [workflowId, updateWorkflowQuery, onRun, saveQuery]);

  const [showHistory, setShowHistory] = useState(false);

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
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            SQL Query
          </h3>
          <button
            className={`rounded p-0.5 transition-colors ${showHistory ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => setShowHistory(!showHistory)}
            title="Query history"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="text-xs text-gray-400">
          {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to run
        </span>
      </div>
      {showHistory && (
        <QueryHistory
          workflowId={workflowId}
          onRestore={handleQueryChange}
          onClose={() => setShowHistory(false)}
        />
      )}
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
