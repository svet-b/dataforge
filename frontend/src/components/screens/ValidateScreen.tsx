import { ShieldCheck } from 'lucide-react';

export default function ValidateScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-400">
      <ShieldCheck className="mb-3 h-12 w-12" />
      <p className="text-lg font-medium">Validation</p>
      <p className="mt-1 text-sm">Coming soon</p>
    </div>
  );
}
