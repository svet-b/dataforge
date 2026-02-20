import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { QueryHistoryEntry } from '@/types';
import { Loader2, RotateCcw } from 'lucide-react';
import SqlEditor from './SqlEditor';

interface QueryHistoryProps {
  workflowId: string;
  onRestore: (sql: string) => void;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function QueryHistory({ workflowId, onRestore, onClose }: QueryHistoryProps) {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  useEffect(() => {
    api.content
      .queryHistory(workflowId)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [workflowId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center border-t border-gray-200 py-4 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading history...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="border-t border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
        No query history yet.{' '}
        <button className="text-blue-500 hover:underline" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto border-t border-gray-200">
      {entries.map((entry) => {
        const preview = entry.query.split('\n')[0].slice(0, 80);
        const isExpanded = expandedHash === entry.query_hash;
        return (
          <div key={entry.query_hash}>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
              onClick={() => setExpandedHash(isExpanded ? null : entry.query_hash)}
            >
              <span className="flex-1 truncate font-mono text-gray-600">{preview}</span>
              <span className="shrink-0 text-gray-400">{timeAgo(entry.last_used)}</span>
              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
                {entry.run_count}x
              </span>
            </button>
            {isExpanded && (
              <div className="bg-gray-50/50 px-3 pb-2">
                <div className="mb-2 max-h-40 overflow-auto">
                  <SqlEditor value={entry.query} placeholder="" />
                </div>
                <button
                  className="flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600"
                  onClick={() => {
                    onRestore(entry.query);
                    onClose();
                  }}
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
