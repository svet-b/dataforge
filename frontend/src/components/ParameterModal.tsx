import { useState } from 'react';
import type { WorkflowParameter } from '@/types';
import { useWorkflowStore } from '@/stores/workflow';
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
import { X } from 'lucide-react';

interface ParameterModalProps {
  workflowId: string;
  parameters: WorkflowParameter[];
  open: boolean;
  onClose: () => void;
}

export default function ParameterModal({ workflowId, parameters, open, onClose }: ParameterModalProps) {
  const updateWorkflowParams = useWorkflowStore((s) => s.updateWorkflowParams);
  const [rows, setRows] = useState<WorkflowParameter[]>(
    parameters.length > 0 ? parameters.map((p) => ({ ...p })) : [],
  );
  const [nameError, setNameError] = useState('');

  function addRow() {
    setRows([...rows, { name: '', type: 'string', default: '', description: '' }]);
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof WorkflowParameter, value: string) {
    setRows(rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function validate(): boolean {
    const names = rows.map((r) => r.name.trim()).filter(Boolean);
    const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    for (const name of names) {
      if (!identifierRegex.test(name)) {
        setNameError(`Invalid name: "${name}" (must be a valid identifier)`);
        return false;
      }
    }
    if (new Set(names).size !== names.length) {
      setNameError('Duplicate parameter names');
      return false;
    }
    setNameError('');
    return true;
  }

  async function save() {
    if (!validate()) return;
    const cleaned = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        type: r.type,
        default: r.default || null,
        description: r.description || null,
      }));
    await updateWorkflowParams(workflowId, cleaned);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl" data-testid="parameter-modal">
        <DialogHeader>
          <DialogTitle>Workflow Parameters</DialogTitle>
          <DialogDescription>Define parameters that can be provided at runtime.</DialogDescription>
        </DialogHeader>

        {nameError && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-600">{nameError}</div>
        )}

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {rows.map((row, i) => (
            <div key={i} className="flex items-start gap-2 rounded border border-gray-200 p-2">
              <div className="flex-1">
                <Input
                  className="mb-1"
                  placeholder="Name"
                  value={row.name}
                  onChange={(e) => updateRow(i, 'name', e.target.value)}
                />
                <div className="flex gap-1">
                  <select
                    className="w-24 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                    value={row.type}
                    onChange={(e) => updateRow(i, 'type', e.target.value)}
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <Input
                    className="flex-1 text-xs"
                    placeholder="Default value"
                    value={row.default ?? ''}
                    onChange={(e) => updateRow(i, 'default', e.target.value)}
                  />
                </div>
                <Input
                  className="mt-1 text-xs"
                  placeholder="Description"
                  value={row.description ?? ''}
                  onChange={(e) => updateRow(i, 'description', e.target.value)}
                />
              </div>
              <button
                className="mt-1 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                onClick={() => removeRow(i)}
                aria-label="Remove parameter"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button className="text-xs font-medium text-blue-600 hover:text-blue-700" onClick={addRow}>
          + Add Parameter
        </button>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
