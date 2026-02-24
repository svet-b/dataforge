import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SourceResponse, SchemaColumn } from '@/types';
import { useWorkflowStore } from '@/stores/workflow';
import { api } from '@/api/client';
import { debounce } from '@/utils/debounce';
import { deriveTableName, tableNameFromUrl } from '@/utils/tableName';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FileSourceConfig from './FileSourceConfig';
import ApiSourceConfig from './ApiSourceConfig';
import AmmpSourceConfig from './AmmpSourceConfig';



interface SourceConfigPanelProps {
  workflowId: string;
  source: SourceResponse;
}

export default function SourceConfigPanel({ workflowId, source }: SourceConfigPanelProps) {
  const updateSource = useWorkflowStore((s) => s.updateSource);
  const workflow = useWorkflowStore((s) => s.workflow);

  // ── File source state ──
  const [filename, setFilename] = useState((source.config.filename as string) ?? '');
  const [fileType, setFileType] = useState((source.config.file_type as string) ?? '');
  const [delimiter, setDelimiter] = useState((source.config.delimiter as string) ?? ',');
  const [hasHeader, setHasHeader] = useState((source.config.has_header as boolean) ?? true);

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

  // ── AMMP source state ──
  const [ammpEndpoint, setAmmpEndpoint] = useState((source.config.endpoint as string) ?? 'historic-energy');
  const [ammpAssetId, setAmmpAssetId] = useState((source.config.asset_id as string) ?? '');
  const [ammpDateFrom, setAmmpDateFrom] = useState((source.config.date_from as string) ?? '');
  const [ammpDateTo, setAmmpDateTo] = useState((source.config.date_to as string) ?? '');
  const [ammpInterval, setAmmpInterval] = useState((source.config.interval as string) ?? '1h');

  // ── Common ──
  const [tableName, setTableName] = useState(source.table_name);
  const [tableNameManuallyEdited, setTableNameManuallyEdited] = useState(false);

  // ── Schema state ──
  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>([]);
  const [schemaRowCount, setSchemaRowCount] = useState<number | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const otherTableNames = useMemo(
    () => (workflow?.sources ?? []).filter((s) => s.id !== source.id).map((s) => s.table_name),
    [workflow?.sources, source.id],
  );

  const sourceConfigured = source.type === 'file'
    ? !!(source.config.filename as string)
    : source.type === 'ammp'
      ? !!(source.config.asset_id as string)
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
    setAmmpEndpoint((source.config.endpoint as string) ?? 'historic-energy');
    setAmmpAssetId((source.config.asset_id as string) ?? '');
    setAmmpDateFrom((source.config.date_from as string) ?? '');
    setAmmpDateTo((source.config.date_to as string) ?? '');
    setAmmpInterval((source.config.interval as string) ?? '1h');
    setTableNameManuallyEdited(false);
  }, [source]);

  const fetchSchema = useCallback(async () => {
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const result = await api.sources.schema(workflowId, source.id);
      setSchemaColumns(result.columns);
      setSchemaRowCount(result.row_count);
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : 'Failed to load schema');
      setSchemaColumns([]);
      setSchemaRowCount(null);
    } finally {
      setSchemaLoading(false);
    }
  }, [workflowId, source.id]);

  // Auto-fetch schema when source is configured or response_path changes
  useEffect(() => {
    if (sourceConfigured) {
      fetchSchema();
    } else {
      setSchemaColumns([]);
      setSchemaRowCount(null);
      setSchemaError(null);
    }
  }, [source.id, sourceConfigured, source.config.response_path, fetchSchema]);

  // Use a ref to hold the latest local state for the debounced save
  const stateRef = useRef({ tableName, filename, fileType, delimiter, hasHeader, url, method, headers, body, responsePath, ammpEndpoint, ammpAssetId, ammpDateFrom, ammpDateTo, ammpInterval });
  stateRef.current = { tableName, filename, fileType, delimiter, hasHeader, url, method, headers, body, responsePath, ammpEndpoint, ammpAssetId, ammpDateFrom, ammpDateTo, ammpInterval };

  const saveConfig = useMemo(
    () =>
      debounce(() => {
        const s = stateRef.current;
        let config: Record<string, unknown>;
        if (source.type === 'file') {
          config = { filename: s.filename, file_type: s.fileType };
          if (s.fileType === 'csv') {
            config.delimiter = s.delimiter;
            config.has_header = s.hasHeader;
          }
        } else if (source.type === 'ammp') {
          config = {
            endpoint: s.ammpEndpoint,
            asset_id: s.ammpAssetId || undefined,
            date_from: s.ammpDateFrom || undefined,
            date_to: s.ammpDateTo || undefined,
            interval: s.ammpInterval || undefined,
          };
        } else {
          config = {
            url: s.url,
            method: s.method,
            headers: s.headers.filter((h) => h.key),
            body: s.method === 'POST' ? s.body : undefined,
            response_path: s.responsePath || undefined,
          };
        }
        updateSource(workflowId, source.id, {
          table_name: s.tableName || undefined,
          config,
        });
      }, 500),
    [workflowId, source.id, source.type, updateSource],
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

  return (
    <div className="border-t border-gray-200 bg-gray-50/50" data-testid="source-config">
      <div className="space-y-3 p-3">
        {/* Table name */}
        <div>
          <Label className="mb-1 block text-xs text-gray-600">Table Name</Label>
          <Input
            className="text-sm"
            value={tableName}
            onChange={(e) => onTableNameInput(e.target.value)}
            placeholder="my_table"
          />
        </div>

        {source.type === 'file' ? (
          <FileSourceConfig
            workflowId={workflowId}
            sourceId={source.id}
            filename={filename}
            fileType={fileType}
            delimiter={delimiter}
            hasHeader={hasHeader}
            otherTableNames={otherTableNames}
            tableNameManuallyEdited={tableNameManuallyEdited}
            onFilenameChange={setFilename}
            onFileTypeChange={setFileType}
            onDelimiterChange={setDelimiter}
            onHasHeaderChange={setHasHeader}
            onTableNameDerived={setTableName}
            onFieldChange={onFieldChange}
            onUploadComplete={() => {
              saveConfig.cancel();
              saveConfig();
              setTimeout(() => fetchSchema(), 600);
            }}
          />
        ) : source.type === 'ammp' ? (
          <AmmpSourceConfig
            workflowId={workflowId}
            sourceId={source.id}
            endpoint={ammpEndpoint}
            assetId={ammpAssetId}
            dateFrom={ammpDateFrom}
            dateTo={ammpDateTo}
            interval={ammpInterval}
            onEndpointChange={setAmmpEndpoint}
            onAssetIdChange={setAmmpAssetId}
            onDateFromChange={setAmmpDateFrom}
            onDateToChange={setAmmpDateTo}
            onIntervalChange={setAmmpInterval}
            onFieldChange={onFieldChange}
          />
        ) : (
          <ApiSourceConfig
            workflowId={workflowId}
            sourceId={source.id}
            url={url}
            method={method}
            headers={headers}
            body={body}
            responsePath={responsePath}
            savedUrl={source.config.url as string | undefined}
            onUrlChange={onUrlInput}
            onMethodChange={setMethod}
            onHeadersChange={setHeaders}
            onBodyChange={setBody}
            onResponsePathChange={setResponsePath}
            onFieldChange={onFieldChange}
          />
        )}

        {/* Schema display */}
        {schemaLoading ? (
          <div className="pt-1">
            <p className="text-xs text-gray-500">Loading schema...</p>
          </div>
        ) : schemaError ? (
          <div className="pt-1">
            <p className="text-xs text-red-600">{schemaError}</p>
          </div>
        ) : schemaColumns.length > 0 ? (
          <div className="pt-1">
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs text-gray-600">Schema</Label>
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
