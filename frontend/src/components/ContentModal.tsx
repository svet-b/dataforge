import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { ContentResponse } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import SqlEditor from './SqlEditor';

const KIND_LABELS: Record<string, string> = {
  query: 'Query',
  source_config: 'Source Config',
  parameters: 'Parameters',
  source_data: 'Source Data',
};

interface ContentModalProps {
  hash: string | null;
  onClose: () => void;
}

export default function ContentModal({ hash, onClose }: ContentModalProps) {
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hash) {
      setContent(null);
      return;
    }
    setLoading(true);
    setError(null);
    api.content
      .get(hash)
      .then(setContent)
      .catch((err) => setError(err.message ?? 'Failed to load content'))
      .finally(() => setLoading(false));
  }, [hash]);

  function formatJson(raw: string): string {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  return (
    <Dialog open={hash !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            {content ? KIND_LABELS[content.kind] ?? content.kind : 'Content'}
            {hash && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                {hash.slice(0, 16)}...
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}

        {error && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        {content && !loading && (
          <div className="max-h-[60vh] overflow-auto">
            {content.kind === 'query' ? (
              <SqlEditor value={content.content} placeholder="" />
            ) : (
              <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 font-mono text-xs text-gray-700">
                {formatJson(content.content)}
              </pre>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
