import { useApp } from '../context/AppContext';

export default function TopBar() {
  const { timer, elapsedDisplay, setActiveTab, activeTab } = useApp();

  return (
    <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 bg-zinc-950 border-b border-zinc-800"
      style={{ height: 52, paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-2">
        <svg width="28" height="28" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <defs><clipPath id="tc"><rect width="200" height="200" rx="46"/></clipPath></defs>
          <g clipPath="url(#tc)">
            <rect width="200" height="200" fill="#18181B"/>
            <ellipse cx="83" cy="104" rx="68" ry="58" fill="#FBBF24" opacity="0.07"/>
            <g transform="rotate(10,100,105)"><rect x="44" y="22" width="110" height="144" rx="15" fill="#27272A"/><rect x="44" y="22" width="110" height="22" rx="15" fill="#3F3F46"/></g>
            <g transform="rotate(4.5,100,105)"><rect x="36" y="14" width="110" height="144" rx="15" fill="#FBBF24" opacity="0.32"/></g>
            <rect x="26" y="6" width="112" height="146" rx="15" fill="#FBBF24"/>
            <rect x="26" y="6" width="112" height="24" rx="15" fill="white" opacity="0.08"/>
            <rect x="39" y="34" width="66" height="11" rx="5" fill="#78350F" opacity="0.55"/>
            <rect x="39" y="53" width="52" height="7" rx="3" fill="#78350F" opacity="0.28"/>
            <rect x="39" y="66" width="62" height="7" rx="3" fill="#78350F" opacity="0.28"/>
            <line x1="30" y1="100" x2="132" y2="100" stroke="#78350F" strokeWidth="2.5" strokeDasharray="6,4" opacity="0.40"/>
            <polyline points="37,121 59,142 112,104" stroke="#78350F" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.65"/>
          </g>
        </svg>
        <span className="text-lg font-bold text-zinc-50" style={{ letterSpacing: '-0.04em' }}>docket</span>
      </div>

      {timer && (
        <button
          onClick={() => setActiveTab('timer')}
          className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-full px-3 py-1.5 min-h-[36px]"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 timer-pulse" />
          <span className="font-mono text-sm font-medium text-amber-400">
            {elapsedDisplay}
          </span>
        </button>
      )}
    </div>
  );
}
