import { useState } from 'react';
import { LayoutList, CalendarDays } from 'lucide-react';
import LogTab from './Log';
import InvoicesTab from './Invoices';
import CalendarTab from './Calendar';

const VIEW_KEY = 'workLogView';

export default function WorkTab() {
  const [sub, setSub] = useState('log');
  const [logView, setLogView] = useState(() => localStorage.getItem(VIEW_KEY) || 'list');

  const toggleLogView = () => {
    const next = logView === 'list' ? 'calendar' : 'list';
    setLogView(next);
    localStorage.setItem(VIEW_KEY, next);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="segmented flex-1">
            <button onClick={() => setSub('log')} className={sub === 'log' ? 'active' : ''}>Log</button>
            <button onClick={() => setSub('invoices')} className={sub === 'invoices' ? 'active' : ''}>Invoices</button>
          </div>
          {sub === 'log' && (
            <button
              onClick={toggleLogView}
              title={logView === 'calendar' ? 'Switch to list' : 'Switch to calendar'}
              className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-colors min-h-[44px] ${
                logView === 'calendar'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              {logView === 'calendar' ? <LayoutList size={18} /> : <CalendarDays size={18} />}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {sub === 'log'
          ? (logView === 'calendar' ? <CalendarTab /> : <LogTab />)
          : <InvoicesTab />
        }
      </div>
    </div>
  );
}
