import { useState } from 'react';
import { api } from '@/api/client';
import { addToast } from '@/stores/toasts';
import { deriveTableName } from '@/utils/tableName';
import { Input } from '@/components/ui/input';

interface FileSourceConfigProps {
  workflowId: string;
  sourceId: string;
  filename: string;
  fileType: string;
  delimiter: string;
  hasHeader: boolean;
  otherTableNames: string[];
  tableNameManuallyEdited: boolean;
  onFilenameChange: (filename: string) => void;
  onFileTypeChange: (fileType: string) => void;
  onDelimiterChange: (delimiter: string) => void;
  onHasHeaderChange: (hasHeader: boolean) => void;
  onTableNameDerived: (tableName: string) => void;
  onFieldChange: () => void;
  onUploadComplete: () => void;
}

export default function FileSourceConfig({
  workflowId,
  sourceId,
  filename,
  fileType,
  delimiter,
  hasHeader,
  otherTableNames,
  tableNameManuallyEdited,
  onFilenameChange,
  onFileTypeChange,
  onDelimiterChange,
  onHasHeaderChange,
  onTableNameDerived,
  onFieldChange,
  onUploadComplete,
}: FileSourceConfigProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const result = await api.files.upload(workflowId, file);
      onFilenameChange(result.filename);
      onFileTypeChange(result.file_type);

      if (!tableNameManuallyEdited) {
        onTableNameDerived(deriveTableName(result.filename, otherTableNames));
      }

      onUploadComplete();
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
              onChange={(e) => { onDelimiterChange(e.target.value); onFieldChange(); }}
            />
          </div>
          <div className="flex items-end gap-1.5 pb-0.5">
            <input
              type="checkbox"
              id={`header-${sourceId}`}
              checked={hasHeader}
              onChange={(e) => { onHasHeaderChange(e.target.checked); onFieldChange(); }}
            />
            <label htmlFor={`header-${sourceId}`} className="text-xs text-gray-600">Header row</label>
          </div>
        </div>
      )}
    </>
  );
}
