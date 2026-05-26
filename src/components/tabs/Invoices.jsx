import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import InvoicePreviewModal from '../modals/InvoicePreviewModal';
import {
  decimalToHHMM, formatCurrency, formatDateDisplay, formatDateFull,
  formatInvoiceNumber, sumHours, sumEarnings, groupEntriesByDate, todayStr
} from '../../lib/utils';
import { generateInvoicePDF } from '../../lib/pdf';
import { CheckSquare, Square, CheckCircle, Share2, Download } from 'lucide-react';

export default function InvoicesTab() {
  const [subTab, setSubTab] = useState('create');

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tabs */}
      <div className="shrink-0 px-4 pt-3 pb-0">
        <div className="segmented">
          <button onClick={() => setSubTab('create')} className={subTab === 'create' ? 'active' : ''}>Create</button>
          <button onClick={() => setSubTab('history')} className={subTab === 'history' ? 'active' : ''}>History</button>
        </div>
      </div>

      {subTab === 'create' ? <CreateInvoice /> : <InvoiceHistory />}
    </div>
  );
}

function CreateInvoice() {
  const { settings, addToast, triggerRefresh, refreshKey } = useApp();
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [filterClient, setFilterClient] = useState(null);

  const loadEntries = useCallback(async () => {
    const allItems = await window.storage.getAll('entries:');
    const unpaid = allItems.map((i) => i.value).filter(Boolean)
      .filter((e) => e.status === 'unpaid' && e.billable !== false);
    unpaid.sort((a, b) => b.date !== a.date ? b.date.localeCompare(a.date) : b.timeIn.localeCompare(a.timeIn));
    setEntries(unpaid);
    setSelected(new Set()); // reset selection on reload
  }, [refreshKey]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Unique clients for filter chips
  const clients = [...new Set(entries.map((e) => e.clientName).filter(Boolean))].sort();
  // If filterClient no longer exists in entries, reset it
  const activeFilter = clients.includes(filterClient) ? filterClient : null;

  const visibleEntries = activeFilter ? entries.filter((e) => e.clientName === activeFilter) : entries;
  const grouped = groupEntriesByDate(visibleEntries);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const visibleKeys = visibleEntries.map((e) => e.key);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));

  const selectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleKeys.forEach((k) => next.delete(k));
      } else {
        visibleKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const selectedEntries = entries.filter((e) => selected.has(e.key));
  const selectedHours = sumHours(selectedEntries);
  const selectedEarnings = sumEarnings(selectedEntries);

  const handleGenerate = async () => {
    if (!settings) return;
    // Get next invoice number, respecting startingInvoiceNumber setting
    let counter = (await window.storage.get('settings:invoice-counter')) || 0;
    if (counter === 0) counter = Math.max(0, (settings.startingInvoiceNumber || 1) - 1);
    counter += 1;
    const prefix = settings.invoicePrefix || 'INV-';
    const invoiceNumber = formatInvoiceNumber(prefix, counter);

    const subtotal = Math.round(selectedEarnings * 100) / 100;
    const gstAmount = settings.gstRegistered ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
    const total = Math.round((subtotal + gstAmount) * 100) / 100;

    // Try to pre-fill client address from matching job profile
    const invoiceClientName = selectedEntries[0]?.clientName || settings.defaultClientName || '';
    const matchingProfile = (settings?.jobProfiles || []).find((p) => p.clientName === invoiceClientName);
    const newInvoice = {
      invoiceNumber,
      date: todayStr(),
      clientName: invoiceClientName,
      clientAddress: matchingProfile?.clientAddress || '',
      reference: '',
      entries: selectedEntries,
      subtotal,
      gstAmount,
      total,
      status: 'outstanding',
      _pendingCounter: counter,
    };
    setInvoice(newInvoice);
    setShowPreview(true);
  };

  const handleConfirm = async (inv) => {
    try {
      // Save counter
      await window.storage.set('settings:invoice-counter', inv._pendingCounter);
      // Save invoice
      const toSave = { ...inv };
      delete toSave._pendingCounter;
      await window.storage.set(`invoices:${inv.invoiceNumber}`, toSave);
      // Mark entries as invoiced
      for (const entry of inv.entries) {
        const updated = { ...entry, status: 'invoiced', invoiceNumber: inv.invoiceNumber };
        await window.storage.set(entry.key, updated);
      }
      addToast(`${inv.invoiceNumber} created`, 'success');
      triggerRefresh();
      setShowPreview(false);
      setInvoice(null);
    } catch (err) {
      addToast('Failed to create invoice', 'error');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Client filter chips */}
      {clients.length > 1 && (
        <div className="shrink-0 px-4 py-2 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setFilterClient(null)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${!activeFilter ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
          >
            All
          </button>
          {clients.map((c) => (
            <button
              key={c}
              onClick={() => setFilterClient(c === activeFilter ? null : c)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${activeFilter === c ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Select all bar */}
      {entries.length > 0 && (
        <div className="shrink-0 px-4 py-2 flex items-center justify-between border-b border-slate-800">
          <button onClick={selectAll} className="flex items-center gap-2 text-sm text-slate-300 min-h-[44px]">
            {allVisibleSelected
              ? <CheckSquare size={18} className="text-violet-400" />
              : <Square size={18} className="text-slate-500" />}
            Select all
          </button>
          <span className="text-xs text-slate-500">{visibleEntries.length} unbilled entr{visibleEntries.length === 1 ? 'y' : 'ies'}</span>
        </div>
      )}

      {/* Entry list */}
      <div className="flex-1 scroll-area px-4 py-3">
        {visibleEntries.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3 opacity-50" />
            <p className="text-slate-400 font-medium">All caught up!</p>
            <p className="text-sm text-slate-600 mt-1">No unbilled entries{activeFilter ? ` for ${activeFilter}` : ''}</p>
          </div>
        ) : (
          sortedDates.map((date) => {
            const dayEntries = grouped[date];
            const dayHours = sumHours(dayEntries);
            const dayEarnings = sumEarnings(dayEntries);

            return (
              <div key={date} className="mb-4">
                <div className="flex justify-between items-center py-1.5 mb-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    {formatDateDisplay(date)}
                  </p>
                  <div className="flex gap-3">
                    <span className="font-mono text-xs text-slate-500">{decimalToHHMM(dayHours)}</span>
                    <span className="font-mono text-xs text-slate-400">{formatCurrency(dayEarnings)}</span>
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  {dayEntries.map((entry, idx) => (
                    <button
                      key={entry.key}
                      onClick={() => toggle(entry.key)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors min-h-[60px] ${idx < dayEntries.length - 1 ? 'border-b border-slate-800' : ''}`}
                    >
                      {selected.has(entry.key)
                        ? <CheckSquare size={18} className="text-violet-400 shrink-0" />
                        : <Square size={18} className="text-slate-600 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs text-slate-400">{entry.timeIn} – {entry.timeOut}</p>
                        <p className="text-sm text-slate-200 truncate">{entry.description || entry.projectName || 'Labour'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-medium text-slate-50">{formatCurrency(entry.earnings)}</p>
                        <p className="font-mono text-xs text-slate-500">{decimalToHHMM(entry.workingHours)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
        <div className="h-20" />
      </div>

      {/* Sticky footer */}
      {selected.size > 0 && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-950 px-4 py-3">
          <div className="flex justify-between items-center mb-3">
            <div className="flex gap-4">
              <div>
                <p className="font-mono text-sm font-semibold text-slate-50">{decimalToHHMM(selectedHours)}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Hours</p>
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-amber-400">{formatCurrency(selectedEarnings)}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Total</p>
              </div>
            </div>
            <span className="text-xs text-slate-400">{selected.size} selected</span>
          </div>
          <button
            onClick={handleGenerate}
            className="w-full bg-gradient-to-r from-violet-600 to-violet-800 hover:from-violet-500 hover:to-violet-700 text-white font-bold rounded-xl py-3.5 min-h-[52px] transition-colors"
          >
            Generate Invoice →
          </button>
        </div>
      )}

      <InvoicePreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        invoice={invoice}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function InvoiceHistory() {
  const { settings, addToast, triggerRefresh, refreshKey } = useApp();
  const [invoices, setInvoices] = useState([]);
  const [viewInvoice, setViewInvoice] = useState(null);

  const loadInvoices = useCallback(async () => {
    const allItems = await window.storage.getAll('invoices:');
    const loaded = allItems.map((i) => i.value).filter(Boolean);
    loaded.sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber));
    setInvoices(loaded);
  }, [refreshKey]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const handleMarkPaid = async (inv) => {
    const updated = { ...inv, status: 'paid' };
    await window.storage.set(`invoices:${inv.invoiceNumber}`, updated);
    // Update all associated entry statuses to paid_invoice
    for (const entry of inv.entries || []) {
      const stored = await window.storage.get(entry.key);
      if (stored && stored.status === 'invoiced') {
        await window.storage.set(entry.key, { ...stored, status: 'paid_invoice' });
      }
    }
    addToast(`${inv.invoiceNumber} marked as paid`, 'success');
    triggerRefresh();
    setViewInvoice(updated);
  };

  return (
    <div className="flex-1 scroll-area px-4 py-3">
      {invoices.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 text-sm">No invoices yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <button
              key={inv.invoiceNumber}
              onClick={() => setViewInvoice(inv)}
              className="w-full text-left bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 hover:border-slate-700 transition-colors min-h-[64px]"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-50">{inv.invoiceNumber}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                      inv.status === 'paid'
                        ? 'bg-emerald-400/15 text-emerald-400'
                        : 'bg-blue-400/15 text-blue-400'
                    }`}>
                      {inv.status === 'paid' ? 'PAID' : 'OUTSTANDING'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{inv.clientName}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{formatDateFull(inv.date)} · {inv.entries?.length || 0} entries</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-base font-semibold text-slate-50">{formatCurrency(inv.total)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="h-4" />

      {viewInvoice && (
        <InvoiceDetailSheet
          invoice={viewInvoice}
          settings={settings}
          onClose={() => setViewInvoice(null)}
          onMarkPaid={() => handleMarkPaid(viewInvoice)}
        />
      )}
    </div>
  );
}

function InvoiceDetailSheet({ invoice, settings, onClose, onMarkPaid }) {
  const { addToast } = useApp();
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    setSharing(true);
    try {
      const filename = `${invoice.invoiceNumber}.pdf`;
      const doc = generateInvoicePDF(invoice, settings);
      const blob = doc.output('blob');
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: filename, files: [file] });
        addToast('Invoice shared', 'success');
      } else {
        doc.save(filename);
        addToast('PDF saved', 'success');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') addToast('PDF export failed', 'error');
    } finally {
      setSharing(false);
    }
  };

  const handleSavePDF = () => {
    try {
      const doc = generateInvoicePDF(invoice, settings);
      doc.save(`${invoice.invoiceNumber}.pdf`);
      addToast('PDF saved to device', 'success');
    } catch {
      addToast('PDF export failed', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-slate-900 rounded-t-2xl max-h-[90vh] flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="font-mono font-semibold text-slate-50">{invoice.invoiceNumber}</h2>
            <p className="text-xs text-slate-500">{invoice.clientName} · {formatDateFull(invoice.date)}</p>
          </div>
          <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-lg ${
            invoice.status === 'paid' ? 'bg-emerald-400/15 text-emerald-400' : 'bg-blue-400/15 text-blue-400'
          }`}>
            {invoice.status === 'paid' ? 'PAID' : 'OUTSTANDING'}
          </span>
        </div>
        <div className="flex-1 scroll-area px-4 py-3 space-y-2">
          {(invoice.entries || []).map((entry, i) => (
            <div key={entry.key || i} className="bg-slate-800 rounded-xl px-4 py-2.5">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-mono text-xs text-slate-400">{formatDateFull(entry.date)}</p>
                  <p className="text-sm text-slate-200">{entry.description || 'Labour'}</p>
                </div>
                <p className="font-mono text-sm text-slate-50 ml-3">{formatCurrency(entry.earnings)}</p>
              </div>
            </div>
          ))}
          <div className="bg-slate-800 rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="font-semibold text-slate-200">Total</span>
            <span className="font-mono text-lg font-bold text-amber-400">{formatCurrency(invoice.total)}</span>
          </div>
          <div className="space-y-2 pt-1">
            <div className={canShare ? 'grid grid-cols-2 gap-3' : ''}>
              {canShare && (
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  className="flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-60 text-slate-50 font-medium rounded-xl py-3.5 min-h-[52px] transition-colors"
                >
                  <Share2 size={16} />
                  {sharing ? 'Preparing…' : 'Share'}
                </button>
              )}
              <button
                onClick={handleSavePDF}
                className={`flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-50 font-medium rounded-xl py-3.5 min-h-[52px] transition-colors ${!canShare ? 'w-full' : ''}`}
              >
                <Download size={16} />
                Save PDF
              </button>
            </div>
            {invoice.status !== 'paid' && (
              <button onClick={onMarkPaid}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl py-3.5 min-h-[52px] transition-colors">
                Mark as Paid
              </button>
            )}
          </div>
          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}
