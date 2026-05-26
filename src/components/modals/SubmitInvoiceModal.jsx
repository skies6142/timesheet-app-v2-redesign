import { useState, useEffect } from 'react';
import { X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import * as orgApi from '../../lib/orgApi';
import { useApp } from '../../context/AppContext';
import { decimalToHHMM, formatCurrency, formatABN, sumHours, sumEarnings } from '../../lib/utils';

export default function SubmitInvoiceModal({ isOpen, orgId, onClose, onSubmitted }) {
  const { addToast, settings } = useApp();

  const [entries, setEntries]       = useState([]);
  const [selected, setSelected]     = useState(new Set());
  const [description, setDescription] = useState('');
  const [notes, setNotes]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showBusiness, setShowBusiness] = useState(false);

  // Business / payment fields — pre-filled from settings
  const [businessName, setBusinessName] = useState('');
  const [abn, setAbn]                   = useState('');
  const [bankName, setBankName]         = useState('');
  const [bsb, setBsb]                   = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [includeGst, setIncludeGst]     = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadEntries();
    if (settings) {
      setBusinessName(settings.businessName || '');
      setAbn(settings.abn || '');
      setBankName(settings.bankName || '');
      setBsb(settings.bsb || '');
      setAccountNumber(settings.accountNumber || '');
      setIncludeGst(settings.gstRegistered || false);
      const terms = settings.paymentTermsDays
        ? `Payment due within ${settings.paymentTermsDays} days. Please use invoice number as payment reference.`
        : 'Please use invoice number as payment reference.';
      setNotes(terms);
    }
  }, [isOpen, settings]);

  const loadEntries = async () => {
    const allItems = await window.storage.getAll('entries:');
    const all = allItems.map(i => i.value).filter(Boolean);
    const cutoff = format(subDays(new Date(), 90), 'yyyy-MM-dd');
    const recent = all
      .filter(e => e.date >= cutoff && (e.status === 'unpaid' || e.status === 'invoiced'))
      .sort((a, b) => b.date.localeCompare(a.date) || b.timeIn.localeCompare(a.timeIn));
    setEntries(recent);
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
    if (selected.size === entries.length) setSelected(new Set());
    else setSelected(new Set(entries.map(e => e.key)));
  };

  const selectedEntries = entries.filter(e => selected.has(e.key));
  const totalHours    = sumHours(selectedEntries);
  const subtotal      = sumEarnings(selectedEntries);
  const gstAmount     = includeGst ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const total         = subtotal + gstAmount;

  const periodFrom = selectedEntries.length > 0 ? selectedEntries[selectedEntries.length - 1].date : '';
  const periodTo   = selectedEntries.length > 0 ? selectedEntries[0].date : '';

  const handleSubmit = async () => {
    if (selected.size === 0) { addToast('Select at least one entry', 'error'); return; }
    setSubmitting(true);
    try {
      const counter = (await window.storage.get('settings:invoice-counter') || 0) + 1;
      const prefix = settings?.invoicePrefix || 'INV-';
      const invoiceNumber = `${prefix}${String(counter).padStart(3, '0')}`;

      const invoiceData = {
        invoiceNumber,
        businessName: businessName.trim(),
        abn: abn.replace(/\D/g, ''),
        description: description.trim() || `Labour — ${periodFrom ? format(parseISO(periodFrom), 'd MMM') : ''} to ${periodTo ? format(parseISO(periodTo), 'd MMM yyyy') : ''}`,
        periodFrom,
        periodTo,
        hours: totalHours,
        subtotal,
        gst: gstAmount,
        total,
        gstRegistered: includeGst,
        bankName: bankName.trim(),
        bsb: bsb.trim(),
        accountNumber: accountNumber.trim(),
        notes: notes.trim(),
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
      await window.storage.set('settings:invoice-counter', counter);
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
      <div className="relative z-10 bg-slate-900 rounded-t-2xl flex flex-col"
        style={{ maxHeight: '94vh', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <h2 className="text-base font-semibold text-slate-50">Submit Invoice</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 scroll-area overflow-y-auto px-5 py-4 space-y-4">

          {/* Invoice description */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1.5">Invoice Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Weekly labour — week of 5 May"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          {/* Business & payment details (collapsible) */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowBusiness(b => !b)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <div className="text-left">
                <p className="text-xs text-slate-500 uppercase tracking-widest">Business & Payment Details</p>
                {!showBusiness && businessName && (
                  <p className="text-sm text-slate-300 mt-0.5">
                    {businessName}{abn ? ` · ABN ${formatABN(abn)}` : ''}
                  </p>
                )}
              </div>
              {showBusiness ? <ChevronUp size={16} className="text-slate-500 shrink-0" /> : <ChevronDown size={16} className="text-slate-500 shrink-0" />}
            </button>

            {showBusiness && (
              <div className="px-4 pb-4 space-y-3 border-t border-slate-700">
                <div className="pt-3 grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">Business / Trading Name</label>
                    <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                      placeholder="Your business name"
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">ABN</label>
                    <input value={abn} onChange={e => setAbn(e.target.value)}
                      placeholder="12 345 678 901"
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Bank Name</label>
                    <input value={bankName} onChange={e => setBankName(e.target.value)}
                      placeholder="CBA"
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">BSB</label>
                    <input value={bsb} onChange={e => setBsb(e.target.value)}
                      placeholder="062-000"
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">Account Number</label>
                    <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                      placeholder="12345678"
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50" />
                  </div>
                </div>
                <button
                  onClick={() => setIncludeGst(g => !g)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                    includeGst ? 'bg-amber-400/10 border-amber-400/30' : 'bg-slate-700 border-slate-600'}`}
                >
                  <span className="text-sm text-slate-200">Include 10% GST</span>
                  <div className={`w-10 h-5 rounded-full transition-colors ${includeGst ? 'bg-amber-400' : 'bg-slate-600'} relative`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${includeGst ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Financial summary */}
          {selected.size > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Period</span>
                <span className="text-slate-200 font-medium">
                  {periodFrom && format(parseISO(periodFrom), 'd MMM')} – {periodTo && format(parseISO(periodTo), 'd MMM yyyy')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total hours</span>
                <span className="font-mono text-slate-200">{decimalToHHMM(totalHours)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-mono text-slate-200">{formatCurrency(subtotal)}</span>
              </div>
              {includeGst && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">GST (10%)</span>
                  <span className="font-mono text-slate-200">{formatCurrency(gstAmount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-700">
                <span className="font-semibold text-slate-100">Total</span>
                <span className="font-mono text-xl font-bold text-amber-400">{formatCurrency(total)}</span>
              </div>
            </div>
          )}

          {/* Entry selection */}
          {entries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm">No unpaid entries in the last 90 days</p>
              <p className="text-slate-600 text-xs mt-1">Clock in some time first, then submit here</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 uppercase tracking-widest">{selected.size} of {entries.length} entries selected</p>
                <button onClick={toggleAll} className="text-xs text-amber-400 hover:text-amber-300">
                  {selected.size === entries.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="space-y-2">
                {entries.map(e => {
                  const isSelected = selected.has(e.key);
                  return (
                    <button key={e.key} onClick={() => toggleEntry(e.key)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                        isSelected ? 'bg-amber-400/8 border-amber-400/25' : 'bg-slate-800 border-slate-700'}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-amber-400 bg-amber-400' : 'border-slate-600'}`}>
                        {isSelected && <Check size={11} className="text-slate-950" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 font-medium truncate">
                          {e.description || e.projectName || e.clientName || 'Labour'}
                        </p>
                        <p className="font-mono text-xs text-slate-500">
                          {format(parseISO(e.date), 'd MMM')} · {e.timeIn} – {e.timeOut}
                          {e.hourlyRate ? ` · $${e.hourlyRate}/hr` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-semibold text-slate-100">{formatCurrency(e.earnings)}</p>
                        <p className="font-mono text-xs text-slate-500">{decimalToHHMM(e.workingHours)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1.5">Notes to Organisation</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Payment terms, reference, etc."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 resize-none"
            />
          </div>

          <div className="h-2" />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-bold rounded-2xl py-4"
          >
            {submitting ? 'Submitting…' : `Submit Invoice${total > 0 ? ` — ${formatCurrency(total)}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
