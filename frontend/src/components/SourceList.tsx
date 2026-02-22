import type { SourceType } from '@/types';
import { useWorkflowStore } from '@/stores/workflow';
import { deriveTableName } from '@/utils/tableName';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { FileSpreadsheet, Globe, Plus, X } from 'lucide-react';

interface SourceListProps {
  workflowId: string;
}

export default function SourceList({ workflowId }: SourceListProps) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const selectedSourceId = useWorkflowStore((s) => s.selectedSourceId);
  const addSource = useWorkflowStore((s) => s.addSource);
  const deleteSource = useWorkflowStore((s) => s.deleteSource);
  const selectSource = useWorkflowStore((s) => s.selectSource);

  const sources = workflow?.sources ?? [];

  function handleAdd(type: SourceType) {
    const existingNames = sources.map((s) => s.table_name);
    const prefix = type === 'file' ? 'file' : 'api';
    const tableName = deriveTableName(prefix, existingNames);
    addSource(workflowId, type, tableName);
  }

  function handleDelete(e: React.MouseEvent, sourceId: string) {
    e.stopPropagation();
    deleteSource(workflowId, sourceId);
  }

  function handleSelect(sourceId: string) {
    selectSource(selectedSourceId === sourceId ? null : sourceId);
  }

  function TypeIcon({ type }: { type: string }) {
    return type === 'api'
      ? <Globe className="h-4 w-4 text-gray-500" />
      : <FileSpreadsheet className="h-4 w-4 text-gray-500" />;
  }

  function typeLabel(type: string): string {
    return type === 'api' ? 'API' : 'File';
  }

  return (
    <div className="flex flex-col" data-testid="source-list">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Inputs</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" data-testid="add-source-btn">
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleAdd('file')} data-testid="add-file-source">
              <FileSpreadsheet className="text-gray-500" />
              File Source
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAdd('api')} data-testid="add-api-source">
              <Globe className="text-gray-500" />
              API Source
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-y-auto">
        {sources.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-400">
            No input sources yet.<br />Click + Add to get started.
          </div>
        ) : (
          sources.map((source) => (
            <div
              key={source.id}
              className={`flex w-full cursor-pointer items-center gap-2 border-b border-gray-100 px-3 py-2 text-left transition-colors hover:bg-gray-50 ${
                selectedSourceId === source.id ? 'bg-blue-50' : ''
              }`}
              onClick={() => handleSelect(source.id)}
              data-testid="source-item"
            >
              <TypeIcon type={source.type} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800">{source.table_name}</div>
                <div className="text-xs text-gray-400">{typeLabel(source.type)}</div>
              </div>
              <button
                className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                onClick={(e) => handleDelete(e, source.id)}
                aria-label="Remove source"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
