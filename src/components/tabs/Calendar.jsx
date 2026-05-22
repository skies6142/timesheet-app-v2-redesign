import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import EntryModal from '../modals/EntryModal';
import BottomSheet from '../ui/BottomSheet';
import {
  getDaysInMonth, formatCurrency, formatDateDisplay, decimalToHHMM,
  sumHours, sumEarnings, getWeekNumber, getDateRange, isInRange,
  statusLabel, statusDotColor
} from '../../lib/utils';
import { format, parseISO, addMonths, subMonths } from 'date-fns';
import { Plus } from 'lucide-react';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarTab() {
  const { refreshKey } = useApp();
  const [viewDate, setViewDate] = useState(new Date());
  const [entryMap, setEntryMap] = useState({}); // date → entries[]
  const [selectedDate, setSelectedDate] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [showDaySheet, setShowDaySheet] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);

  const swipeRef = useRef(null);

  const handleTouchStart = (e) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (!swipeRef.current) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;
    swipeRef.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      setViewDate(d => dx > 0 ? subMonths(d, 1) : addMonths(d, 1));
    }
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = getDaysInMonth(year, month);

  const loadEntries = useCallback(async () => {
    const firstDay = format(new Date(year, month, 1), 'yyyy-MM-dd');
    const lastDay = format(new Date(year, month + 1, 0), 'yyyy-MM-dd');
    const allItems = await window.storage.getAll('entries:');
    const filtered = allItems.map((i) => i.value).filter(Boolean)
      .filter((e) => isInRange(e.date, firstDay, lastDay));
    const map = {};
    for (const e of filtered) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    setEntryMap(map);
  }, [year, month, refreshKey]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const monthStart = format(new Date(year, month, 1), 'yyyy-MM-dd');
  const monthEnd = format(new Date(year, month + 1, 0), 'yyyy-MM-dd');
  const allMonthEntries = Object.values(entryMap).flat();
  const monthHours = sumHours(allMonthEntries);
  const monthEarnings = sumEarnings(allMonthEntries);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const openDay = (date) => {
    setSelectedDate(date);
    setShowDaySheet(true);
  };

  const selectedDayEntries = selectedDate ? (entryMap[selectedDate] || []) : [];

  // Get week numbers for each row
  const rows = [];
  for (let i = 0; i < days.length; i += 7) {
    rows.push(days.slice(i, i + 7));
  }

  return (
    <div className="h-full flex flex-col" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setViewDate(subMonths(viewDate, 1))}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 min-h-[44px] text-lg">
            ‹
          </button>
          <div className="text-center">
            <p className="font-semibold text-zinc-50">{format(viewDate, 'MMMM yyyy')}</p>
          </div>
          <button onClick={() => setViewDate(addMonths(viewDate, 1))}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 min-h-[44px] text-lg">
            ›
          </button>
        </div>
        {/* Month totals */}
        <div className="flex justify-center gap-6 text-sm text-zinc-400 pb-1">
          <span><span className="font-mono text-zinc-200">{decimalToHHMM(monthHours)}</span> hrs</span>
          <span><span className="font-mono text-amber-400">{formatCurrency(monthEarnings)}</span></span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 scroll-area px-2 pb-4">
        {/* Day headers */}
        <div className="grid grid-cols-8 mb-1 pl-8">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-[10px] text-zinc-600 uppercase tracking-widest py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((row, rowIdx) => {
          // Week number from first non-null date in row
          const firstRealDate = row.find(Boolean);
          const wkNum = firstRealDate ? getWeekNumber(firstRealDate) : '';

          return (
            <div key={rowIdx} className="grid grid-cols-8 mb-1 items-start">
              {/* Week number */}
              <div className="flex items-start justify-center pt-2">
                <span className="text-[9px] text-zinc-600 font-medium">Wk{wkNum}</span>
              </div>

              {row.map((date, cellIdx) => {
                if (!date) {
                  return <div key={cellIdx} className="aspect-square" />;
                }

                const dayEntries = entryMap[date] || [];
                const hours = sumHours(dayEntries);
                const earnings = sumEarnings(dayEntries);
                const isToday = date === todayStr;
                const isCurrentMonth = date.slice(0, 7) === format(viewDate, 'yyyy-MM');
                const dayNum = parseInt(date.slice(8));

                const hasUnpaid = dayEntries.some((e) => e.status === 'unpaid');
                const hasInvoiced = dayEntries.some((e) => e.status === 'invoiced');
                const hasPaid = dayEntries.some((e) => e.status === 'paid_cash' || e.status === 'paid_invoice');

                return (
                  <button
                    key={date}
                    onClick={() => openDay(date)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-start p-1 transition-colors min-h-[44px] ${
                      isToday ? 'border border-amber-400' : 'border border-transparent'
                    } ${dayEntries.length > 0 ? 'bg-zinc-900 hover:bg-zinc-800' : 'hover:bg-zinc-900/50'}`}
                  >
                    <span className={`text-xs font-medium ${isToday ? 'text-amber-400' : isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {dayNum}
                    </span>
                    {hours > 0 && (
                      <>
                        <span className="font-mono text-[9px] text-amber-400 leading-tight">{decimalToHHMM(hours)}</span>
                        <span className="font-mono text-[8px] text-zinc-400 leading-tight">{earnings.toFixed(0)}</span>
                      </>
                    )}
                    {dayEntries.length > 0 && (
                      <div className="flex gap-0.5 mt-auto">
                        {hasUnpaid && <span className="w-1 h-1 rounded-full bg-amber-400" />}
                        {hasInvoiced && <span className="w-1 h-1 rounded-full bg-blue-400" />}
                        {hasPaid && <span className="w-1 h-1 rounded-full bg-emerald-400" />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
        <div className="h-4" />
      </div>

      {/* Day detail sheet */}
      <BottomSheet
        isOpen={showDaySheet}
        onClose={() => setShowDaySheet(false)}
        title={selectedDate ? formatDateDisplay(selectedDate) : ''}
      >
        <div className="px-4 py-3 space-y-2">
          {selectedDayEntries.length === 0 ? (
            <p className="text-center text-zinc-500 py-8 text-sm">No entries for this day</p>
          ) : (
            selectedDayEntries
              .sort((a, b) => a.timeIn.localeCompare(b.timeIn))
              .map((entry) => (
                <button
                  key={entry.key}
                  onClick={() => { setShowDaySheet(false); setEditEntry(entry); }}
                  className="w-full text-left bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 hover:border-zinc-600 transition-colors min-h-[64px]"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-zinc-300">{entry.timeIn} – {entry.timeOut}</p>
                      <p className="text-sm text-zinc-200 mt-0.5 truncate">{entry.description || entry.projectName || 'Labour'}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor(entry.status)}`} />
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{statusLabel(entry.status)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-medium text-zinc-50">{formatCurrency(entry.earnings)}</p>
                      <p className="font-mono text-xs text-zinc-500">{decimalToHHMM(entry.workingHours)}</p>
                    </div>
                  </div>
                </button>
              ))
          )}
          {/* Totals */}
          {selectedDayEntries.length > 1 && (
            <div className="border-t border-zinc-800 pt-2 flex justify-between px-1">
              <span className="text-xs text-zinc-500">Day total</span>
              <div className="flex gap-4">
                <span className="font-mono text-xs text-zinc-300">{decimalToHHMM(sumHours(selectedDayEntries))}</span>
                <span className="font-mono text-xs text-amber-400">{formatCurrency(sumEarnings(selectedDayEntries))}</span>
              </div>
            </div>
          )}
          <button
            onClick={() => { setShowDaySheet(false); setShowAddEntry(true); }}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-zinc-700 hover:border-amber-400/50 text-zinc-500 hover:text-amber-400 rounded-xl py-3 min-h-[48px] transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Add Entry for {selectedDate ? formatDateDisplay(selectedDate) : 'this day'}
          </button>
          <div className="h-2" />
        </div>
      </BottomSheet>

      {/* Edit existing entry — reopen day sheet after close */}
      <EntryModal
        isOpen={!!editEntry}
        onClose={() => {
          setEditEntry(null);
          if (selectedDate) setShowDaySheet(true);
        }}
        entry={editEntry}
        defaultDate={selectedDate}
      />

      {/* Add new entry for selected date — reopen day sheet after close */}
      <EntryModal
        isOpen={showAddEntry}
        onClose={() => {
          setShowAddEntry(false);
          if (selectedDate) setShowDaySheet(true);
        }}
        defaultDate={selectedDate}
      />
    </div>
  );
}
