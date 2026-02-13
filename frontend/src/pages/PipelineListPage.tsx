import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { addToast } from '@/stores/toasts';
import type { PipelineSummary } from '@/types';
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

export default function PipelineListPage() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPipelines();
  }, []);

  useEffect(() => {
    if (showCreateModal) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [showCreateModal]);

  async function loadPipelines() {
    setLoading(true);
    try {
      setPipelines(await api.pipelines.list());
    } catch {
      addToast('Failed to load pipelines', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function createPipeline() {
    if (!newName.trim()) return;
    try {
      const pipeline = await api.pipelines.create({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
      navigate(`/pipelines/${pipeline.id}`);
    } catch {
      addToast('Failed to create pipeline', 'error');
    }
  }

  async function deletePipeline(id: string) {
    try {
      await api.pipelines.delete(id);
      setPipelines((prev) => prev.filter((p) => p.id !== id));
      setConfirmDeleteId(null);
      addToast('Pipeline deleted', 'success');
    } catch {
      addToast('Failed to delete pipeline', 'error');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900">DataForge</h1>
          <Button onClick={() => setShowCreateModal(true)}>New Pipeline</Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading ? (
          <div className="py-12 text-center text-gray-500">Loading...</div>
        ) : pipelines.length === 0 ? (
          <div className="py-12 text-center" data-testid="empty-state">
            <p className="text-lg text-gray-500">No pipelines yet</p>
            <p className="mt-1 text-sm text-gray-400">Create your first pipeline to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="pipeline-grid">
            {pipelines.map((pipeline) => (
              <div
                key={pipeline.id}
                className="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                data-testid="pipeline-card"
              >
                <a href={`/pipelines/${pipeline.id}`} className="block" onClick={(e) => { e.preventDefault(); navigate(`/pipelines/${pipeline.id}`); }}>
                  <h3 className="font-semibold text-gray-900">{pipeline.name}</h3>
                  {pipeline.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">{pipeline.description}</p>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                    <span>{pipeline.source_count} sources</span>
                    <span>Updated {formatDate(pipeline.updated_at)}</span>
                  </div>
                </a>
                <button
                  className="absolute right-2 top-2 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  onClick={(e) => { e.preventDefault(); setConfirmDeleteId(pipeline.id); }}
                  aria-label="Delete pipeline"
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
        <DialogContent data-testid="create-pipeline-modal">
          <DialogHeader>
            <DialogTitle>New Pipeline</DialogTitle>
            <DialogDescription>Create a new data pipeline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="pipeline-name" className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <Input
                id="pipeline-name"
                ref={nameInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Pipeline"
                onKeyDown={(e) => e.key === 'Enter' && createPipeline()}
              />
            </div>
            <div>
              <label htmlFor="pipeline-desc" className="mb-1 block text-sm font-medium text-gray-700">Description (optional)</label>
              <Textarea
                id="pipeline-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                placeholder="What does this pipeline do?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={createPipeline} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm" data-testid="delete-confirm-modal">
          <DialogHeader>
            <DialogTitle>Delete Pipeline?</DialogTitle>
            <DialogDescription>This action cannot be undone. All sources and data will be permanently deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteId && deletePipeline(confirmDeleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
