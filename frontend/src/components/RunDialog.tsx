import { useState } from 'react';
import type { WorkflowParameter } from '@/types';
import { useWorkflowStore } from '@/stores/workflow';
import { useRunsStore } from '@/stores/runs';
import { useResultsStore } from '@/stores/results';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface RunDialogProps {
  workflowId: string;
  parameters: WorkflowParameter[];
  open: boolean;
  onClose: () => void;
  onRunComplete: () => void;
}

export default function RunDialog({ workflowId, parameters, open, onClose, onRunComplete }: RunDialogProps) {
  const runWorkflow = useWorkflowStore((s) => s.runWorkflow);
  const loadRuns = useRunsStore((s) => s.loadRuns);
  const setResults = useResultsStore((s) => s.setResults);
  const setError = useResultsStore((s) => s.setError);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(parameters.map((p) => [p.name, (p.default as string) ?? ''])),
  );
  const [running, setRunning] = useState(false);

  function updateValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleRun() {
    setRunning(true);
    const params: Record<string, unknown> = {};
    for (const p of parameters) {
      const val = values[p.name];
      if (p.type === 'number') params[p.name] = Number(val) || 0;
      else if (p.type === 'boolean') params[p.name] = val === 'true';
      else params[p.name] = val;
    }
    try {
      const result = await runWorkflow(workflowId, params);
      if (result) {
        setResults(result);
      } else {
        setError('Run failed');
      }
      await loadRuns(workflowId);
      onRunComplete();
      onClose();
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="run-dialog">
        <DialogHeader>
          <DialogTitle>Run Workflow</DialogTitle>
          <DialogDescription>Provide parameter values for this run.</DialogDescription>
        </DialogHeader>

        {parameters.length > 0 ? (
          <div className="space-y-3">
            {parameters.map((param) => (
              <div key={param.name}>
                <label htmlFor={`run-param-${param.name}`} className="mb-1 block text-sm font-medium text-gray-700">
                  {param.name}
                  {param.description && (
                    <span className="ml-1 font-normal text-gray-400">- {param.description}</span>
                  )}
                </label>
                {param.type === 'boolean' ? (
                  <select
                    id={`run-param-${param.name}`}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    value={values[param.name]}
                    onChange={(e) => updateValue(param.name, e.target.value)}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <Input
                    id={`run-param-${param.name}`}
                    type={param.type === 'number' ? 'number' : 'text'}
                    value={values[param.name]}
                    onChange={(e) => updateValue(param.name, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No parameters configured. Run with defaults?</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
          <Button data-testid="run-execute-btn" onClick={handleRun} disabled={running}>
            {running ? 'Running...' : 'Run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
