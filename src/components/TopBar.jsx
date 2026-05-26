import { useApp } from '../context/AppContext';

export default function TopBar() {
  const { timer, elapsedDisplay, setActiveTab } = useApp();

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5"
      style={{
        height: 56,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'rgba(10,15,30,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(139,92,246,0.12)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7.5" r="4" stroke="white" strokeWidth="1.5"/>
            <line x1="7" y1="7.5" x2="7" y2="4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="7" y1="7.5" x2="9" y2="8.7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <rect x="5" y="1.5" width="4" height="1.2" rx="0.6" fill="white"/>
          </svg>
        </div>
        <span className="text-base font-bold tracking-tight text-slate-100">
          Time<span className="brand-text">Sheet</span>
        </span>
      </div>

      {timer && (
        <button
          onClick={() => setActiveTab('timer')}
          className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.3)',
          }}
        >
          <span className="w-2 h-2 rounded-full timer-pulse" style={{ background: '#8B5CF6' }} />
          <span className="font-mono text-sm font-semibold" style={{ color: '#A78BFA' }}>
            {elapsedDisplay}
          </span>
        </button>
      )}
    </div>
  );
}
