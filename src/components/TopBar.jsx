import { useApp } from '../context/AppContext';

export default function TopBar() {
  const { timer, elapsedDisplay, setActiveTab, activeTab } = useApp();

  return (
    <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 bg-zinc-950 border-b border-zinc-800"
      style={{ height: 52, paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <span className="text-lg font-bold tracking-tight text-zinc-50">
        Time<span className="text-amber-400">Sheet</span>
      </span>

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
