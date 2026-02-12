import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

interface Entry {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  entries: Entry[];
  onChange: (entries: Entry[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export default function KeyValueEditor({
  entries,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: KeyValueEditorProps) {
  function addEntry() {
    onChange([...entries, { key: '', value: '' }]);
  }

  function removeEntry(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  function updateEntry(index: number, field: 'key' | 'value', val: string) {
    onChange(entries.map((e, i) => (i === index ? { ...e, [field]: val } : e)));
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            className="flex-1 text-xs"
            placeholder={keyPlaceholder}
            value={entry.key}
            onChange={(e) => updateEntry(i, 'key', e.target.value)}
          />
          <Input
            className="flex-1 text-xs"
            placeholder={valuePlaceholder}
            value={entry.value}
            onChange={(e) => updateEntry(i, 'value', e.target.value)}
          />
          <button
            className="text-gray-400 hover:text-red-500"
            onClick={() => removeEntry(i)}
            aria-label="Remove entry"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button className="text-xs text-blue-600 hover:text-blue-700" onClick={addEntry}>
        + Add
      </button>
    </div>
  );
}
