import { useState } from 'react';
import LogTab from './Log';
import InvoicesTab from './Invoices';

export default function WorkTab() {
  const [sub, setSub] = useState('log');

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-zinc-800">
        <div className="segmented">
          <button onClick={() => setSub('log')} className={sub === 'log' ? 'active' : ''}>Log</button>
          <button onClick={() => setSub('invoices')} className={sub === 'invoices' ? 'active' : ''}>Invoices</button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {sub === 'log' ? <LogTab /> : <InvoicesTab />}
      </div>
    </div>
  );
}
