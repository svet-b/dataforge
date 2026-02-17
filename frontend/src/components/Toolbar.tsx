import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWorkflowStore } from '@/stores/workflow';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
interface ToolbarProps {
  workflowId: string;
  workflowName: string;
  onOpenParams: () => void;
  onRun: () => void;
}

export default function Toolbar({ workflowId, workflowName, onOpenParams, onRun }: ToolbarProps) {
  const updateWorkflowName = useWorkflowStore((s) => s.updateWorkflowName);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEdit() {
    setEditValue(workflowName);
    setEditing(true);
  }

  function saveName() {
    setEditing(false);
    if (editValue.trim() && editValue !== workflowName) {
      updateWorkflowName(workflowId, editValue.trim());
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') setEditing(false);
  }

  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2" data-testid="toolbar">
      <Link to="/" className="text-gray-500 hover:text-gray-700" aria-label="Back to workflows">
        <ArrowLeft className="h-5 w-5" />
      </Link>

      <div className="flex-1">
        {editing ? (
          <input
            ref={inputRef}
            data-testid="workflow-name-input"
            className="rounded border border-gray-300 px-2 py-1 text-sm font-semibold focus:border-blue-500 focus:outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={saveName}
          />
        ) : (
          <button
            data-testid="workflow-name"
            className="text-sm font-semibold text-gray-800 hover:text-blue-600"
            onClick={startEdit}
          >
            {workflowName}
          </button>
        )}
      </div>

      <Button variant="outline" size="sm" onClick={onOpenParams}>
        Parameters
      </Button>

      <Button size="sm" onClick={onRun}>
        Run
      </Button>
    </div>
  );
}
