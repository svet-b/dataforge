import { Database, ShieldCheck, FlaskConical, Play } from 'lucide-react';

export type Screen = 'source' | 'validate' | 'analyze' | 'execute';

interface ScreenSidebarProps {
  activeScreen: Screen;
  onScreenChange: (screen: Screen) => void;
}

const screens: { id: Screen; label: string; icon: typeof Database; disabled?: boolean }[] = [
  { id: 'source', label: 'Source', icon: Database },
  { id: 'validate', label: 'Validate', icon: ShieldCheck, disabled: true },
  { id: 'analyze', label: 'Analyze', icon: FlaskConical },
  { id: 'execute', label: 'Execute', icon: Play },
];

export default function ScreenSidebar({ activeScreen, onScreenChange }: ScreenSidebarProps) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center bg-gray-900 py-3">
      {screens.map(({ id, label, icon: Icon, disabled }) => {
        const isActive = activeScreen === id;
        return (
          <button
            key={id}
            title={disabled ? `${label} (coming soon)` : label}
            disabled={disabled}
            className={`relative mb-1 flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              disabled
                ? 'cursor-not-allowed text-gray-600'
                : isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
            onClick={() => !disabled && onScreenChange(id)}
          >
            {isActive && (
              <div className="absolute left-0 top-1.5 h-5 w-0.5 rounded-r bg-blue-400" />
            )}
            <Icon className="h-5 w-5" />
          </button>
        );
      })}
    </div>
  );
}
