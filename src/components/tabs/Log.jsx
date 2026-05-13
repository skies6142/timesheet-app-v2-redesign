import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import EntryModal from '../modals/EntryModal';
import BottomSheet from '../ui/BottomSheet';
import ConfirmModal from '../ui/ConfirmModal';
import {
  decimalToHHMM, formatCurrency, formatDateDisplay, getDateRange,
  isInRange, groupEntriesByDate, sumHours, sumEarnings,
  statusLabel, statusDotColor, statusColor
} from '../../lib/utils';
import { SlidersHorizontal, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, subDays } from 'date-fns';

const PERIODS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
];

export default function LogTab() {
  const { refreshKey, addToast, triggerRefresh } = useApp();
  const [period, setPeriod] = useState('week');
  const [refDate, setRefDate] = useState(new Date());
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [entries, setEntries] = useState([]);
  const [showFilter, setShowFilter] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProject, setFilterProject] = useState('');
  const [viewEntry, setViewEntry]   = useState(null);
  const [editEntry, setEditEntry]   = useState(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(null);
  const [deleting, setDeleting]     = useState(false);

  const getRange = useCallback(() => {
    if (period === 'custom') {
      return { start: customStart || format(new Date(), 'yyyy-MM-dd'), end: customEnd || format(new Date(), 'yyyy-MM-dd') };
    }
    return getDateRange(period, refDate);
  }, [period, refDate, customStart, customEnd]);

  const loadEntries = useCallback(async () => {
    const { start, end } = getRange();
    const allItems = await window.storage.getAll('entries:');
    let loaded = allItems.map((i) => i.value).filter(Boolean).filter((e) => isInRange(e.date, start, end));

    if (filterStatus === 'paid') {
    loaded = loaded.filter((e) => e.status === 'paid_cash' || e.status === 'paid_invoice');
  } else if (filterStatus !== 'all') {
    loaded = loaded.filter((e) => e.status === filterStatus);
  }
    if (filterProject) loaded = loaded.filter((e) =>
      (e.projectName || '').toLowerCase().includes(filterProject.toLowerCase())
    );

    loaded.sort((a, b) => b.date !== a.date ? b.date.localeCompare(a.date) : b.timeIn.localeCompare(a.timeIn));
    setEntries(loaded);
  }, [getRange, filterStatus, filterProject, refreshKey]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const grouped = groupEntriesByDate(entries);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const totalHours = sumHours(entries);
  const totalEarnings = sumEarnings(entries);

  const periodLabel = () => {
    const { start, end } = getRange();
    if (period === 'day') return format(parseISO(start), 'EEE d MMM yyyy');
    if (period === 'week') return `${format(parseISO(start), 'd MMM')} – ${format(parseISO(end), 'd MMM yyyy')}`;
    if (period === 'month') return format(refDate, 'MMMM yyyy');
    return `${format(parseISO(start), 'd MMM')} – ${format(parseISO(end), 'd MMM yyyy')}`;
  };

  const navigate = (dir) => {
    if (period === 'day') setRefDate((d) => dir > 0 ? addDays(d, 1) : subDays(d, 1));
    else if (period === 'week') setRefDate((d) => dir > 0 ? addDays(d, 7) : subDays(d, 7));
    else if (period === 'month') {
      setRefDate((d) => {
        const next = new Date(d);
        next.setMonth(next.getMonth() + dir);
        return next;
      });
    }
  };

  const allProjects = [...new Set(entries.map((e) => e.projectName).filter(Boolean))];

  const handleDeleteEntry = async () => {
    if (!confirmDeleteEntry) return;
    setDeleting(true);
    try {
      await window.storage.delete(confirmDeleteEntry.key);
      addToast('Entry deleted', 'success');
      triggerRefresh();
    } finally {
      setDeleting(false);
      setConfirmDeleteEntry(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 space-y-2">
        {/* Period selector row */}
        <div className="flex items-center gap-2">
          <div className="segmented flex-1">
            {PERIODS.map((p) => (
              <button key={p.value} onClick={() => setPeriod(p.value)} className={period === p.value ? 'active' : ''}>
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFilter(true)}
            className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-colors min-h-[44px] ${
              filterStatus !== 'all' || filterProject ? 'border-amber-400 text-amber-400' : 'border-zinc-700 text-zinc-400'
            }`}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>

        {/* Navigation + period label */}
        {period !== 'custom' && (
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 min-h-[44px]">‹</button>
            <span className="flex-1 text-center text-sm font-medium text-zinc-300">{periodLabel()}</span>
            <button onClick={() => navigate(1)} className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 min-h-[44px]">›</button>
          </div>
        )}

        {period === 'custom' && (
          <div className="flex gap-2">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-50 min-h-[44px] focus:outline-none focus:border-amber-400" />
            <span className="text-zinc-500 flex items-center">–</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-50 min-h-[44px] focus:outline-none focus:border-amber-400" />
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="shrink-0 mx-4 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 flex justify-between items-center mb-2">
        <div className="text-center">
          <p className="font-mono text-base font-semibold text-zinc-50">{decimalToHHMM(totalHours)}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Hours</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-base font-semibold text-amber-400">{formatCurrency(totalEarnings)}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Earnings</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-base font-semibold text-zinc-50">{entries.length}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Entries</p>
        </div>
      </div>

      {/* Entry list */}
      <div className="flex-1 scroll-area px-4 pb-4">
        {sortedDates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">No entries for this period</p>
          </div>
        ) : (
          sortedDates.map((date) => {
            const dayEntries = grouped[date];
            const dayHours = sumHours(dayEntries);
            const dayEarnings = sumEarnings(dayEntries);
            return (
              <div key={date} className="mb-4">
                <div className="flex justify-between items-center py-2 mb-1">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                    {formatDateDisplay(date)}
                  </p>
                  <div className="flex gap-3">
                    <span className="font-mono text-xs text-zinc-500">{decimalToHHMM(dayHours)}</span>
                    <span className="font-mono text-xs text-zinc-400">{formatCurrency(dayEarnings)}</span>
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {dayEntries.map((entry, idx) => (
                    <EntryRow
                      key={entry.key}
                      entry={entry}
                      last={idx === dayEntries.length - 1}
                      onView={() => setViewEntry(entry)}
                      onDelete={() => setConfirmDeleteEntry(entry)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}

        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-zinc-700 hover:border-amber-400/50 text-zinc-500 hover:text-amber-400 rounded-2xl py-4 min-h-[56px] transition-colors mt-2"
        >
          <Plus size={18} />
          Add Entry
        </button>
        <div className="h-4" />
      </div>

      {/* Filter sheet */}
      <BottomSheet isOpen={showFilter} onClose={() => setShowFilter(false)} title="Filter">
        <div className="px-5 py-4 space-y-5">
          <div>
            <p className="text-sm font-medium text-zinc-400 mb-2">Payment Status</p>
            <div className="segmented">
              {[
                { value: 'all', label: 'All' },
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'invoiced', label: 'Invoiced' },
                { value: 'paid', label: 'Paid' },
              ].map((opt) => (
                <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
                  className={filterStatus === opt.value ? 'active' : ''}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-400 mb-2">Project</p>
            <input
              type="text"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              placeholder="Filter by project name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 text-sm min-h-[48px] focus:outline-none focus:border-amber-400"
            />
          </div>
          <button
            onClick={() => { setFilterStatus('all'); setFilterProject(''); setShowFilter(false); }}
            className="w-full border border-zinc-700 text-zinc-400 rounded-xl py-3 min-h-[48px] text-sm"
          >
            Clear Filters
          </button>
          <div className="h-2" />
        </div>
      </BottomSheet>

      {/* Entry detail sheet */}
      <EntryDetailSheet
        entry={viewEntry}
        isOpen={!!viewEntry}
        onClose={() => setViewEntry(null)}
        onEdit={() => { const e = viewEntry; setViewEntry(null); setEditEntry(e); }}
        onDelete={() => { const e = viewEntry; setViewEntry(null); setConfirmDeleteEntry(e); }}
      />

      <EntryModal isOpen={!!editEntry} onClose={() => setEditEntry(null)} entry={editEntry} />
      <EntryModal isOpen={showAdd} onClose={() => setShowAdd(false)} />
      <ConfirmModal
        isOpen={!!confirmDeleteEntry}
        icon="danger"
        title="Delete entry?"
        message="This entry will be permanently removed."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteEntry}
        onCancel={() => setConfirmDeleteEntry(null)}
        loading={deleting}
      />
    </div>
  );
}

const SWIPE_REVEAL = 80;

function EntryRow({ entry, last, onView, onDelete }) {
  const dotColor = { unpaid: 'bg-amber-400', invoiced: 'bg-blue-400', paid_cash: 'bg-emerald-400', paid_invoice: 'bg-emerald-400' };
  const sColor = { unpaid: 'text-zinc-500', invoiced: 'text-blue-400', paid_cash: 'text-emerald-400', paid_invoice: 'text-emerald-400' };

  const [offset, setOffset] = useState(0);
  const touchRef = useRef(null); // { startX, startY, activated }

  const handleTouchStart = (e) => {
    touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, activated: false };
  };

  const handleTouchMove = (e) => {
    if (!touchRef.current) return;
    const dx = e.touches[0].clientX - touchRef.current.startX;
    const dy = e.touches[0].clientY - touchRef.current.startY;
    // Only activate horizontal swipe if more horizontal than vertical
    if (!touchRef.current.activated) {
      if (Math.abs(dy) > Math.abs(dx)) { touchRef.current = null; return; }
      touchRef.current.activated = true;
    }
    const baseOffset = offset === -SWIPE_REVEAL ? -SWIPE_REVEAL : 0;
    const next = Math.min(0, Math.max(-SWIPE_REVEAL, baseOffset + dx));
    setOffset(next);
  };

  const handleTouchEnd = () => {
    if (!touchRef.current?.activated) return;
    setOffset(offset < -SWIPE_REVEAL / 2 ? -SWIPE_REVEAL : 0);
    touchRef.current = null;
  };

  const handleRowClick = () => {
    if (offset !== 0) { setOffset(0); return; }
    onView();
  };

  return (
    <div className={`relative overflow-hidden bg-zinc-900 ${!last ? 'border-b border-zinc-800' : ''}`}>
      {/* Delete button revealed on swipe */}
      <button
        onClick={onDelete}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-0.5 bg-red-500 active:bg-red-600 transition-colors"
        style={{ width: SWIPE_REVEAL }}
      >
        <Trash2 size={16} className="text-white" />
        <span className="text-white text-[10px] font-semibold uppercase tracking-wide">Delete</span>
      </button>

      {/* Swipeable row */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: touchRef.current?.activated ? 'none' : 'transform 0.2s ease',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          onClick={handleRowClick}
          className="w-full text-left px-4 py-3 bg-zinc-900 hover:bg-zinc-800/60 active:bg-zinc-800/70 transition-colors min-h-[64px]"
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-zinc-400">{entry.timeIn} – {entry.timeOut}</span>
              </div>
              <p className="text-sm text-zinc-200 truncate mt-0.5">
                {entry.description || entry.projectName || 'Labour'}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor[entry.status] || 'bg-zinc-600'}`} />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${sColor[entry.status] || 'text-zinc-500'}`}>
                  {(entry.status === 'invoiced' || entry.status === 'paid_invoice') && entry.invoiceNumber
                    ? `${entry.status === 'paid_invoice' ? 'Paid' : 'Invoiced'} ${entry.invoiceNumber}`
                    : statusLabel(entry.status)
                  }
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono text-sm font-medium text-zinc-50">{formatCurrency(entry.earnings)}</p>
              <p className="font-mono text-xs text-zinc-500">{decimalToHHMM(entry.workingHours)}</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

function EntryDetailSheet({ entry, isOpen, onClose, onEdit, onDelete }) {
  if (!entry) return null;
  const dotBg = { unpaid: 'bg-amber-400', invoiced: 'bg-blue-400', paid_cash: 'bg-emerald-400', paid_invoice: 'bg-emerald-400' };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Entry Details">
      <div className="px-5 py-4 space-y-3">
        {/* Time */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl divide-y divide-zinc-700/60">
          <div className="flex justify-between px-4 py-3">
            <span className="text-xs text-zinc-500">Date</span>
            <span className="text-sm font-medium text-zinc-200">{format(parseISO(entry.date), 'EEEE d MMMM yyyy')}</span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-xs text-zinc-500">Time</span>
            <span className="text-sm font-mono text-zinc-200">{entry.timeIn} – {entry.timeOut}</span>
          </div>
          {entry.breakMinutes > 0 && (
            <div className="flex justify-between px-4 py-3">
              <span className="text-xs text-zinc-500">Break</span>
              <span className="text-sm font-mono text-zinc-200">{entry.breakMinutes} min</span>
            </div>
          )}
          <div className="flex justify-between px-4 py-3">
            <span className="text-xs text-zinc-500">Working hours</span>
            <span className="text-sm font-mono font-semibold text-zinc-100">{decimalToHHMM(entry.workingHours)}</span>
          </div>
        </div>

        {/* Work details */}
        {(entry.clientName || entry.projectName || entry.description) && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl divide-y divide-zinc-700/60">
            {entry.clientName && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Client</span>
                <span className="text-sm font-medium text-zinc-200 text-right max-w-[60%]">{entry.clientName}</span>
              </div>
            )}
            {entry.projectName && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Project</span>
                <span className="text-sm font-medium text-zinc-200 text-right max-w-[60%]">{entry.projectName}</span>
              </div>
            )}
            {entry.description && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Description</span>
                <span className="text-sm font-medium text-zinc-200 text-right max-w-[60%]">{entry.description}</span>
              </div>
            )}
          </div>
        )}

        {/* Financials */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl divide-y divide-zinc-700/60">
          {entry.hourlyRate > 0 && (
            <div className="flex justify-between px-4 py-3">
              <span className="text-xs text-zinc-500">Rate</span>
              <span className="text-sm font-mono text-zinc-200">${entry.hourlyRate}/hr</span>
            </div>
          )}
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm font-bold text-zinc-100">Earnings</span>
            <span className="text-lg font-mono font-bold text-amber-400">{formatCurrency(entry.earnings)}</span>
          </div>
        </div>

        {/* Status */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full shrink-0 ${dotBg[entry.status] || 'bg-zinc-500'}`} />
          <div>
            <p className="text-sm font-medium text-zinc-200">{statusLabel(entry.status)}</p>
            {(entry.status === 'invoiced' || entry.status === 'paid_invoice') && entry.invoiceNumber && (
              <p className="text-xs text-zinc-500">{entry.invoiceNumber}</p>
            )}
          </div>
        </div>

        {/* Notes */}
        {entry.notes && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Notes</p>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{entry.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button onClick={onDelete}
            className="flex-1 border border-red-400/30 text-red-400 hover:bg-red-400/10 rounded-xl py-3 min-h-[48px] text-sm font-medium transition-colors">
            Delete
          </button>
          <button onClick={onEdit}
            className="flex-1 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold rounded-xl py-3 min-h-[48px] text-sm transition-colors">
            Edit Entry
          </button>
        </div>
        <div className="h-2" />
      </div>
    </BottomSheet>
  );
}
