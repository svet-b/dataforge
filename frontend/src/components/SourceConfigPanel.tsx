import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SourceResponse, SchemaColumn } from '@/types';
import { usePipelineStore } from '@/stores/pipeline';
import { api } from '@/api/client';
import { addToast } from '@/stores/toasts';
import { debounce } from '@/utils/debounce';
import { deriveTableName, tableNameFromUrl } from '@/utils/tableName';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import KeyValueEditor from './KeyValueEditor';

interface SourceConfigPanelProps {
  pipelineId: string;
  source: SourceResponse;
}

export default function SourceConfigPanel({ pipelineId, source }: SourceConfigPanelProps) {
  const updateSource = usePipelineStore((s) => s.updateSource);
  const pipeline = usePipelineStore((s) => s.pipeline);

  // ── File source state ──
  const [filename, setFilename] = useState((source.config.filename as string) ?? '');
  const [fileType, setFileType] = useState((source.config.file_type as string) ?? '');
  const [delimiter, setDelimiter] = useState((source.config.delimiter as string) ?? ',');
  const [hasHeader, setHasHeader] = useState((source.config.has_header as boolean) ?? true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ── API source state ──
  const [url, setUrl] = useState((source.config.url as string) ?? '');
  const [method, setMethod] = useState((source.config.method as string) ?? 'GET');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
    Array.isArray(source.config.headers)
      ? (source.config.headers as { key: string; value: string }[])
      : [],
  );
  const [body, setBody] = useState((source.config.body as string) ?? '');
  const [responsePath, setResponsePath] = useState((source.config.response_path as string) ?? '');

  // ── Common ──
  const [tableName, setTableName] = useState(source.table_name);
  const [tableNameManuallyEdited, setTableNameManuallyEdited] = useState(false);

  // ── Schema state ──
  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>([]);
  const [schemaRowCount, setSchemaRowCount] = useState<number | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const otherTableNames = useMemo(
    () => (pipeline?.sources ?? []).filter((s) => s.id !== source.id).map((s) => s.table_name),
    [pipeline?.sources, source.id],
  );

  const sourceConfigured = source.type === 'file'
    ? !!(source.config.filename as string)
    : !!(source.config.url as string);

  // Reset state when source changes
  useEffect(() => {
    setTableName(source.table_name);
    setFilename((source.config.filename as string) ?? '');
    setFileType((source.config.file_type as string) ?? '');
    setDelimiter((source.config.delimiter as string) ?? ',');
    setHasHeader((source.config.has_header as boolean) ?? true);
    setUrl((source.config.url as string) ?? '');
    setMethod((source.config.method as string) ?? 'GET');
    setHeaders(
      Array.isArray(source.config.headers)
        ? (source.config.headers as { key: string; value: string }[])
        : [],
    );
    setBody((source.config.body as string) ?? '');
    setResponsePath((source.config.response_path as string) ?? '');
    setTableNameManuallyEdited(false);
  }, [source]);

  const fetchSchema = useCallback(async () => {
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const result = await api.sources.schema(pipelineId, source.id);
      setSchemaColumns(result.columns);
      setSchemaRowCount(result.row_count);
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : 'Failed to load schema');
      setSchemaColumns([]);
      setSchemaRowCount(null);
    } finally {
      setSchemaLoading(false);
    }
  }, [pipelineId, source.id]);

  // Auto-fetch schema when source is configured
  useEffect(() => {
    if (sourceConfigured) {
      fetchSchema();
    } else {
      setSchemaColumns([]);
      setSchemaRowCount(null);
      setSchemaError(null);
    }
  }, [source.id, sourceConfigured, fetchSchema]);

  // Use a ref to hold the latest local state for the debounced save
  const stateRef = useRef({ tableName, filename, fileType, delimiter, hasHeader, url, method, headers, body, responsePath });
  stateRef.current = { tableName, filename, fileType, delimiter, hasHeader, url, method, headers, body, responsePath };

  const saveConfig = useMemo(
    () =>
      debounce(() => {
        const s = stateRef.current;
        const config = source.type === 'file'
          ? (() => {
              const cfg: Record<string, unknown> = { filename: s.filename, file_type: s.fileType };
              if (s.fileType === 'csv') {
                cfg.delimiter = s.delimiter;
                cfg.has_header = s.hasHeader;
              }
              return cfg;
            })()
          : {
              url: s.url,
              method: s.method,
              headers: s.headers.filter((h) => h.key),
              body: s.method === 'POST' ? s.body : undefined,
              response_path: s.responsePath || undefined,
            };
        updateSource(pipelineId, source.id, {
          table_name: s.tableName || undefined,
          config,
        });
      }, 500),
    [pipelineId, source.id, source.type, updateSource],
  );

  function onFieldChange() {
    saveConfig();
  }

  function onTableNameInput(val: string) {
    setTableName(val);
    setTableNameManuallyEdited(true);
    saveConfig();
  }

  function onUrlInput(val: string) {
    setUrl(val);
    if (!tableNameManuallyEdited) {
      const segment = tableNameFromUrl(val);
      if (segment) {
        setTableName(deriveTableName(segment, otherTableNames));
      }
    }
    saveConfig();
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const result = await api.files.upload(pipelineId, file);
      setFilename(result.filename);
      setFileType(result.file_type);

      if (!tableNameManuallyEdited) {
        setTableName(deriveTableName(result.filename, otherTableNames));
      }

      saveConfig.cancel();
      saveConfig();
      setTimeout(() => fetchSchema(), 600);
      addToast(`Uploaded ${result.filename}`, 'success');
    } catch (e) {
      addToast(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setUploading(false);
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50/50" data-testid="source-config">
      <div className="space-y-3 p-3">
        {/* Table name */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Table Name</label>
          <Input
            className="text-sm"
            value={tableName}
            onChange={(e) => onTableNameInput(e.target.value)}
            placeholder="my_table"
          />
        </div>

        {source.type === 'file' ? (
          <>
            {/* File upload */}
            <div
              className={`relative rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
                dragOver ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
            >
              {uploading ? (
                <p className="text-sm text-gray-500">Uploading...</p>
              ) : filename ? (
                <>
                  <p className="text-sm font-medium text-gray-700">{filename}</p>
                  <p className="text-xs text-gray-400">Drop a new file to replace</p>
                </>
              ) : (
                <p className="text-sm text-gray-500">Drop a file here or click to browse</p>
              )}
              <input
                type="file"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={onFileInput}
                accept=".csv,.tsv,.json,.xlsx,.xls,.parquet"
              />
            </div>

            {fileType === 'csv' && (
              <div className="flex gap-3">
                <div className="w-20">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Delimiter</label>
                  <Input
                    className="text-sm"
                    value={delimiter}
                    onChange={(e) => { setDelimiter(e.target.value); onFieldChange(); }}
                  />
                </div>
                <div className="flex items-end gap-1.5 pb-0.5">
                  <input
                    type="checkbox"
                    id={`header-${source.id}`}
                    checked={hasHeader}
                    onChange={(e) => { setHasHeader(e.target.checked); onFieldChange(); }}
                  />
                  <label htmlFor={`header-${source.id}`} className="text-xs text-gray-600">Header row</label>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* API source */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">URL</label>
              <Input
                className="text-sm"
                value={url}
                onChange={(e) => onUrlInput(e.target.value)}
                placeholder="https://api.example.com/data"
              />
            </div>

            <div className="w-28">
              <label className="mb-1 block text-xs font-medium text-gray-600">Method</label>
              <select
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                value={method}
                onChange={(e) => { setMethod(e.target.value); onFieldChange(); }}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Headers</label>
              <KeyValueEditor
                entries={headers}
                onChange={(newHeaders) => { setHeaders(newHeaders); onFieldChange(); }}
                keyPlaceholder="Header name"
                valuePlaceholder="Header value"
              />
            </div>

            {method === 'POST' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Body</label>
                <Textarea
                  className="font-mono text-sm"
                  rows={3}
                  value={body}
                  onChange={(e) => { setBody(e.target.value); onFieldChange(); }}
                  placeholder='{"key": "value"}'
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Response Path</label>
              <Input
                className="text-sm"
                value={responsePath}
                onChange={(e) => { setResponsePath(e.target.value); onFieldChange(); }}
                placeholder="data.results"
              />
            </div>
          </>
        )}

        {/* Schema display */}
        {schemaLoading ? (
          <div className="pt-1">
            <p className="text-xs text-gray-400">Loading schema...</p>
          </div>
        ) : schemaError ? (
          <div className="pt-1">
            <p className="text-xs text-red-400">{schemaError}</p>
          </div>
        ) : schemaColumns.length > 0 ? (
          <div className="pt-1">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">Schema</span>
              {schemaRowCount !== null && (
                <span className="text-xs text-gray-400">{schemaRowCount.toLocaleString()} rows</span>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-white">
              <table className="w-full text-xs">
                <tbody>
                  {schemaColumns.map((col, i) => (
                    <tr key={col.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-2 py-1 font-medium text-gray-700">{col.name}</td>
                      <td className="px-2 py-1 text-right font-mono text-gray-400">{col.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
