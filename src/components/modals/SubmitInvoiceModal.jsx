import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import * as orgApi from '../../lib/orgApi';
import { useApp } from '../../context/AppContext';
import { decimalToHHMM, formatCurrency, sumHours, sumEarnings, isInRange, getDateRange } from '../../lib/utils';

export default function SubmitInvoiceModal({ isOpen, orgId, onClose, onSubmitted }) {
  const { addToast } = useApp();

  const [entries, setEntries]         = useState([]);
  const [selected, setSelected]       = useState(new Set());
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadEntries();
  }, [isOpen]);

  const loadEntries = async () => {
    const allItems = await window.storage.getAll('entries:');
    const all = allItems.map(i => i.value).filter(Boolean);
    // Show last 90 days of unpaid/invoiced entries
    const cutoff = format(subDays(new Date(), 90), 'yyyy-MM-dd');
    const recent = all
      .filter(e => e.date >= cutoff && (e.status === 'unpaid' || e.status === 'invoiced'))
      .sort((a, b) => b.date.localeCompare(a.date) || b.timeIn.localeCompare(a.timeIn));
    setEntries(recent);
    // Pre-select all
    setSelected(new Set(recent.map(e => e.key)));
  };

  if (!isOpen) return null;

  const toggleEntry = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map(e => e.key)));
    }
  };

  const selectedEntries = entries.filter(e => selected.has(e.key));
  const totalHours    = sumHours(selectedEntries);
  const totalEarnings = sumEarnings(selectedEntries);

  const periodFrom = selectedEntries.length > 0
    ? selectedEntries[selectedEntries.length - 1].date
    : '';
  const periodTo = selectedEntries.length > 0
    ? selectedEntries[0].date
    : '';

  const handleSubmit = async () => {
    if (selected.size === 0) { addToast('Select at least one entry', 'error'); return; }
    setSubmitting(true);
    try {
      const invoiceData = {
        description: description.trim() || 'Time entries',
        periodFrom,
        periodTo,
        total: totalEarnings,
        hours: totalHours,
        entries: selectedEntries.map(e => ({
          date: e.date,
          timeIn: e.timeIn,
          timeOut: e.timeOut,
          workingHours: e.workingHours,
          earnings: e.earnings,
          hourlyRate: e.hourlyRate,
          description: e.description || e.projectName || '',
          clientName: e.clientName || '',
        })),
      };
      await orgApi.submitInvoice(orgId, invoiceData);
      onSubmitted();
    } catch (e) {
      addToast(e.message || 'Failed to submit invoice', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-zinc-900 rounded-t-2xl flex flex-col"
        style={{ maxHeight: '92vh', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-base font-semibold text-zinc-50">Submit Invoice</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 scroll-area overflow-y-auto px-5 py-4 space-y-4">
          {/* Description */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Invoice Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Weekly labour — week of 5 May"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          {/* Summary */}
          {selected.size > 0 && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-0.5">
                  {selected.size} entr{selected.size !== 1 ? 'ies' : 'y'} · {periodFrom && format(parseISO(periodFrom), 'd MMM')} – {periodTo && format(parseISO(periodTo), 'd MMM')}
                </p>
                <p className="font-mono text-sm text-zinc-300">{decimalToHHMM(totalHours)} hrs</p>
              </div>
              <p className="font-mono text-2xl font-bold text-amber-400">{formatCurrency(totalEarnings)}</p>
            </div>
          )}

          {/* Entry selection */}
          {entries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-zinc-500 text-sm">No unpaid entries in the last 90 days</p>
              <p className="text-zinc-600 text-xs mt-1">Clock in some time first, then submit your invoice here</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-zinc-500 uppercase tracking-widest">Select Entries</p>
                <button onClick={toggleAll} className="text-xs text-amber-400 hover:text-amber-300">
                  {selected.size === entries.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="space-y-2">
                {entries.map(e => {
                  const isSelected = selected.has(e.key);
                  return (
                    <button
                      key={e.key}
                      onClick={() => toggleEntry(e.key)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                        isSelected
                          ? 'bg-amber-400/8 border-amber-400/25'
                          : 'bg-zinc-800 border-zinc-700'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-amber-400 bg-amber-400' : 'border-zinc-600'
                      }`}>
                        {isSelected && <Check size={11} className="text-zinc-950" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 font-medium truncate">
                          {e.description || e.projectName || e.clientName || 'Labour'}
                        </p>
                        <p className="font-mono text-xs text-zinc-500">
                          {format(parseISO(e.date), 'd MMM')} · {e.timeIn} – {e.timeOut}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-semibold text-zinc-100">{formatCurrency(e.earnings)}</p>
                        <p className="font-mono text-xs text-zinc-500">{decimalToHHMM(e.workingHours)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="h-2" />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-zinc-950 font-bold rounded-2xl py-4"
          >
            {submitting ? 'Submitting…' : `Submit ${selected.size > 0 ? formatCurrency(totalEarnings) : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
