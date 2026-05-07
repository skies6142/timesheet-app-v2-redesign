import { Timer, List, Calendar, FileText, BarChart2, Settings } from 'lucide-react';
import { useApp } from '../context/AppContext';

const TABS = [
  { id: 'timer',    label: 'Timer',    Icon: Timer },
  { id: 'log',      label: 'Log',      Icon: List },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'invoices', label: 'Invoices', Icon: FileText },
  { id: 'stats',    label: 'Stats',    Icon: BarChart2 },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export default function BottomNav() {
  const { activeTab, setActiveTab } = useApp();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch bg-zinc-950 border-t border-zinc-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-colors"
            style={{ minHeight: 56 }}
          >
            <Icon
              size={22}
              className={active ? 'text-amber-400' : 'text-zinc-500'}
              strokeWidth={active ? 2.2 : 1.8}
            />
            <span
              className="text-[10px] uppercase tracking-widest font-medium"
              style={{ color: active ? '#f59e0b' : '#71717a', letterSpacing: '0.08em' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
