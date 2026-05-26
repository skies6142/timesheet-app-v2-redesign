import { useState } from 'react';
import { CalendarDays, LayoutList } from 'lucide-react';
import LogTab from './Log';
import InvoicesTab from './Invoices';
import CalendarTab from './Calendar';

const VIEW_KEY = 'workLogView';

export default function WorkTab() {
  const [sub, setSub] = useState('log');
  const [logView, setLogView] = useState(() => localStorage.getItem(VIEW_KEY) || 'list');

  const setView = (v) => {
    setLogView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="segmented flex-1">
            <button onClick={() => setSub('log')} className={sub === 'log' ? 'active' : ''}>Log</button>
            <button onClick={() => setSub('invoices')} className={sub === 'invoices' ? 'active' : ''}>Invoices</button>
          </div>
          {sub === 'log' && (
            <div className="flex rounded-xl overflow-hidden border border-slate-700">
              <button
                onClick={() => setView('list')}
                className={`w-9 h-9 flex items-center justify-center transition-all ${
                  logView === 'list' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
                style={logView === 'list' ? { background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' } : {}}
              >
                <LayoutList size={15} />
              </button>
              <button
                onClick={() => setView('calendar')}
                className={`w-9 h-9 flex items-center justify-center border-l border-slate-700 transition-all ${
                  logView === 'calendar' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
                style={logView === 'calendar' ? { background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' } : {}}
              >
                <CalendarDays size={15} />
              </button>
            </div>
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
