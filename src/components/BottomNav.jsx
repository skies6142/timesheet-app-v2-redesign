import { Timer, Briefcase, BarChart2, Settings, Building2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

const TABS = [
  { id: 'timer',    label: 'Timer',    Icon: Timer },
  { id: 'work',     label: 'Work',     Icon: Briefcase },
  { id: 'stats',    label: 'Stats',    Icon: BarChart2 },
  { id: 'team',     label: 'Team',     Icon: Building2 },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export default function BottomNav() {
  const { activeTab, setActiveTab } = useApp();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'rgba(10,15,30,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(139,92,246,0.1)',
        height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex-1 flex flex-col items-center justify-center gap-1 relative transition-all"
            style={{ minHeight: 60 }}
          >
            {active && (
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
                style={{ background: 'linear-gradient(90deg, #8B5CF6, #A78BFA)' }}
              />
            )}
            <div
              className="flex items-center justify-center w-9 h-7 rounded-xl transition-all"
              style={active ? {
                background: 'rgba(139,92,246,0.15)',
              } : {}}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.2 : 1.8}
                style={{ color: active ? '#A78BFA' : '#475569' }}
              />
            </div>
            <span
              className="text-[10px] font-semibold tracking-wider uppercase transition-colors"
              style={{ color: active ? '#A78BFA' : '#334155', letterSpacing: '0.07em' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
