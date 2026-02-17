import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { addToast } from '@/stores/toasts';
import type { WorkflowSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function WorkflowListPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  useEffect(() => {
    if (showCreateModal) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [showCreateModal]);

  async function loadWorkflows() {
    setLoading(true);
    try {
      setWorkflows(await api.workflows.list());
    } catch {
      addToast('Failed to load workflows', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function createWorkflow() {
    if (!newName.trim()) return;
    try {
      const workflow = await api.workflows.create({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
      navigate(`/workflows/${workflow.id}`);
    } catch {
      addToast('Failed to create workflow', 'error');
    }
  }

  async function deleteWorkflow(id: string) {
    try {
      await api.workflows.delete(id);
      setWorkflows((prev) => prev.filter((p) => p.id !== id));
      setConfirmDeleteId(null);
      addToast('Workflow deleted', 'success');
    } catch {
      addToast('Failed to delete workflow', 'error');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900">DataForge</h1>
          <Button onClick={() => setShowCreateModal(true)}>New Workflow</Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading ? (
          <div className="py-12 text-center text-gray-500">Loading...</div>
        ) : workflows.length === 0 ? (
          <div className="py-12 text-center" data-testid="empty-state">
            <p className="text-lg text-gray-500">No workflows yet</p>
            <p className="mt-1 text-sm text-gray-400">Create your first workflow to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="workflow-grid">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                data-testid="workflow-card"
              >
                <a href={`/workflows/${workflow.id}`} className="block" onClick={(e) => { e.preventDefault(); navigate(`/workflows/${workflow.id}`); }}>
                  <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
                  {workflow.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">{workflow.description}</p>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                    <span>{workflow.source_count} sources</span>
                    <span>Updated {formatDate(workflow.updated_at)}</span>
                  </div>
                </a>
                <button
                  className="absolute right-2 top-2 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  onClick={(e) => { e.preventDefault(); setConfirmDeleteId(workflow.id); }}
                  aria-label="Delete workflow"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent data-testid="create-workflow-modal">
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
            <DialogDescription>Create a new data workflow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="workflow-name" className="mb-1 block text-xs font-medium text-gray-600">Name</label>
              <Input
                id="workflow-name"
                ref={nameInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Workflow"
                onKeyDown={(e) => e.key === 'Enter' && createWorkflow()}
              />
            </div>
            <div>
              <label htmlFor="workflow-desc" className="mb-1 block text-xs font-medium text-gray-600">Description (optional)</label>
              <Textarea
                id="workflow-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                placeholder="What does this workflow do?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={createWorkflow} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm" data-testid="delete-confirm-modal">
          <DialogHeader>
            <DialogTitle>Delete Workflow?</DialogTitle>
            <DialogDescription>This action cannot be undone. All sources and data will be permanently deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteId && deleteWorkflow(confirmDeleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
