import { useCallback, useEffect, useState } from 'react';
import type { SourceRawResponse } from '@/types';
import { api } from '@/api/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Loader2, Play } from 'lucide-react';
import KeyValueEditor from './KeyValueEditor';
import JsonTree from './JsonTree';

interface ApiSourceConfigProps {
  workflowId: string;
  sourceId: string;
  url: string;
  method: string;
  headers: { key: string; value: string }[];
  body: string;
  responsePath: string;
  savedUrl: string | undefined;
  onUrlChange: (url: string) => void;
  onMethodChange: (method: string) => void;
  onHeadersChange: (headers: { key: string; value: string }[]) => void;
  onBodyChange: (body: string) => void;
  onResponsePathChange: (path: string) => void;
  onFieldChange: () => void;
}

export default function ApiSourceConfig({
  workflowId,
  sourceId,
  url,
  method,
  headers,
  body,
  responsePath,
  savedUrl,
  onUrlChange,
  onMethodChange,
  onHeadersChange,
  onBodyChange,
  onResponsePathChange,
  onFieldChange,
}: ApiSourceConfigProps) {
  const [rawData, setRawData] = useState<SourceRawResponse | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawExpanded, setRawExpanded] = useState(false);

  // Clear raw preview when switching sources or when the saved URL changes
  useEffect(() => {
    setRawData(null);
    setRawError(null);
    setRawLoading(false);
    setRawExpanded(false);
  }, [sourceId, savedUrl]);

  const fetchRawPreview = useCallback(async () => {
    setRawLoading(true);
    setRawError(null);
    setRawData(null);
    setRawExpanded(true);
    try {
      const result = await api.sources.fetchRaw(workflowId, sourceId);
      setRawData(result);
    } catch (e) {
      setRawError(e instanceof Error ? e.message : 'Failed to fetch response');
    } finally {
      setRawLoading(false);
    }
  }, [workflowId, sourceId]);

  const handleSelectPath = useCallback(
    (path: string) => {
      onResponsePathChange(path);
      onFieldChange();
    },
    [onResponsePathChange, onFieldChange],
  );

  return (
    <>
      {/* URL */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label className="text-xs text-gray-600">URL</Label>
          {url && (
            <button
              className="flex items-center gap-1 text-xs text-blue-600 underline hover:text-blue-800 disabled:opacity-50"
              onClick={fetchRawPreview}
              disabled={rawLoading}
            >
              {rawLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Run Request
                </>
              )}
            </button>
          )}
        </div>
        <Input
          className="text-sm"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://api.example.com/data"
        />
      </div>

      <div className="w-28">
        <Label className="mb-1 block text-xs text-gray-600">Method</Label>
        <Select
          value={method}
          onValueChange={(v) => { onMethodChange(v); onFieldChange(); }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-1 block text-xs text-gray-600">Headers</Label>
        <KeyValueEditor
          entries={headers}
          onChange={(newHeaders) => { onHeadersChange(newHeaders); onFieldChange(); }}
          keyPlaceholder="Header name"
          valuePlaceholder="Header value"
        />
      </div>

      {method === 'POST' && (
        <div>
          <Label className="mb-1 block text-xs text-gray-600">Body</Label>
          <Textarea
            className="font-mono text-sm"
            rows={3}
            value={body}
            onChange={(e) => { onBodyChange(e.target.value); onFieldChange(); }}
            placeholder='{"key": "value"}'
          />
        </div>
      )}

      <div>
        <Label className="mb-1 block text-xs text-gray-600">Response Path</Label>
        <Input
          className="text-sm"
          value={responsePath}
          onChange={(e) => { onResponsePathChange(e.target.value); onFieldChange(); }}
          placeholder="data.results"
        />
      </div>

      {/* Raw response preview */}
      {(rawData || rawError) && (
        <div className="pt-1">
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800"
            onClick={() => setRawExpanded(!rawExpanded)}
          >
            {rawExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Raw Response
            {rawData && (
              <span className="ml-1 font-normal text-gray-400">(click arrays to set path)</span>
            )}
          </button>
          {rawExpanded && (
            <div className="mt-1 space-y-2">
              {rawError ? (
                <p className="text-xs text-red-600">{rawError}</p>
              ) : rawData ? (
                <div className="max-h-64 overflow-y-auto rounded border border-gray-200 bg-white p-2">
                  <JsonTree
                    data={rawData.raw_data}
                    selectedPath={responsePath || undefined}
                    onSelectPath={handleSelectPath}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </>
  );
}
