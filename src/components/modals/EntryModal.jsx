import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  generateId, entryKey, calcWorkingHours, calcEarnings,
  decimalToHHMM, formatCurrency, todayStr, statusLabel, getDefaultProfile
} from '../../lib/utils';
import BottomSheet from '../ui/BottomSheet';
import ConfirmModal from '../ui/ConfirmModal';
import { Trash2, Copy, Check } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid', color: 'text-zinc-400' },
  { value: 'paid_cash', label: 'Paid Cash', color: 'text-emerald-400' },
];

export default function EntryModal({ isOpen, onClose, entry = null, defaultDate = null, prefill = null, onAfterSave = null }) {
  const { settings, addToast, triggerRefresh } = useApp();
  const isEdit = !!entry;
  const isClockOut = !!prefill && !isEdit;
  const isInvoiced = entry?.status === 'invoiced' || entry?.status === 'paid_invoice';

  const blankForm = () => {
    const dp = getDefaultProfile(settings);
    return {
      date: defaultDate || todayStr(),
      timeIn: '',
      timeOut: '',
      breakMinutes: '0',
      hourlyRate: String(dp.hourlyRate || ''),
      projectName: dp.projectName || '',
      clientName: dp.clientName || '',
      description: '',
      notes: '',
      status: 'unpaid',
      billable: true,
    };
  };

  const [form, setForm] = useState(blankForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmingDelete(false);
      if (entry) {
        setForm({
          date: entry.date,
          timeIn: entry.timeIn,
          timeOut: entry.timeOut,
          breakMinutes: String(entry.breakMinutes || 0),
          hourlyRate: String(entry.hourlyRate),
          projectName: entry.projectName || '',
          clientName: entry.clientName || '',
          description: entry.description || '',
          notes: entry.notes || '',
          status: entry.status,
          billable: entry.billable !== false,
        });
      } else if (prefill) {
        // Pre-filled from clock-out — use prefill values, fall back to blank for missing fields
        setForm({ ...blankForm(), ...prefill });
      } else {
        setForm(blankForm());
      }
      setErrors({});
    }
  }, [isOpen, entry, prefill]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Computed values
  const workingHours = calcWorkingHours(form.timeIn, form.timeOut, Number(form.breakMinutes) || 0);
  const earnings = calcEarnings(workingHours, Number(form.hourlyRate) || 0);

  const validate = () => {
    const e = {};
    if (!form.date) e.date = 'Required';
    if (!form.timeIn) e.timeIn = 'Required';
    if (!form.timeOut) e.timeOut = 'Required';
    if (form.timeIn && form.timeOut) {
      const wh = calcWorkingHours(form.timeIn, form.timeOut, Number(form.breakMinutes) || 0);
      if (wh <= 0) e.timeOut = 'Time out must be after time in';
    }
    if (!form.hourlyRate || Number(form.hourlyRate) <= 0) e.hourlyRate = 'Must be > 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit) {
        const updated = {
          ...entry,
          date: form.date,
          timeIn: form.timeIn,
          timeOut: form.timeOut,
          breakMinutes: Number(form.breakMinutes) || 0,
          workingHours,
          hourlyRate: Number(form.hourlyRate),
          earnings,
          projectName: form.projectName,
          clientName: form.clientName,
          description: form.description,
          notes: form.notes,
          status: isInvoiced ? entry.status : form.status,
          billable: form.billable,
        };
        // If date changed, need to update key
        const newKey = entryKey(form.date, entry.id);
        if (newKey !== entry.key) {
          await window.storage.delete(entry.key);
          await window.storage.set(newKey, { ...updated, key: newKey, date: form.date });
        } else {
          await window.storage.set(entry.key, updated);
        }
        addToast('Entry updated', 'success');
      } else {
        const id = generateId();
        const key = entryKey(form.date, id);
        const newEntry = {
          id,
          key,
          date: form.date,
          timeIn: form.timeIn,
          timeOut: form.timeOut,
          breakMinutes: Number(form.breakMinutes) || 0,
          workingHours,
          hourlyRate: Number(form.hourlyRate),
          earnings,
          projectName: form.projectName,
          clientName: form.clientName,
          description: form.description,
          notes: form.notes,
          status: form.status,
          invoiceNumber: null,
          billable: form.billable,
        };
        await window.storage.set(key, newEntry);
        // If this save is part of a clock-out, run the after-save hook first
        // (stops the timer + closes notification) before showing the toast
        if (onAfterSave) await onAfterSave();
        addToast(isClockOut ? `Clocked out — ${decimalToHHMM(workingHours)}` : 'Entry added', 'success');
      }
      triggerRefresh();
      onClose();
    } catch (err) {
      addToast('Failed to save entry', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    setDeleting(true);
    try {
      await window.storage.delete(entry.key);
      addToast('Entry deleted', 'info');
      triggerRefresh();
      onClose();
    } catch {
      addToast('Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async () => {
    const id = generateId();
    const key = entryKey(form.date, id);
    const copied = {
      id,
      key,
      date: form.date,
      timeIn: form.timeIn,
      timeOut: form.timeOut,
      breakMinutes: Number(form.breakMinutes) || 0,
      workingHours,
      hourlyRate: Number(form.hourlyRate),
      earnings,
      projectName: form.projectName,
      clientName: form.clientName,
      description: form.description,
      notes: form.notes,
      status: 'unpaid',
      invoiceNumber: null,
      billable: form.billable,
    };
    await window.storage.set(key, copied);
    addToast('Entry copied', 'success');
    triggerRefresh();
    onClose();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={isClockOut ? 'Clock Out' : isEdit ? 'Edit Entry' : 'Add Entry'}
      fullScreen
    >
      <div className="px-5 py-4 space-y-4">
        {isInvoiced && (
          <div className={`border rounded-xl px-4 py-3 ${entry.status === 'paid_invoice' ? 'bg-emerald-400/10 border-emerald-400/30' : 'bg-blue-400/10 border-blue-400/30'}`}>
            <p className={`text-sm ${entry.status === 'paid_invoice' ? 'text-emerald-400' : 'text-blue-400'}`}>
              {entry.status === 'paid_invoice'
                ? <>Invoice <span className="font-semibold">{entry.invoiceNumber}</span> has been paid — time and rate fields are locked.</>
                : <>Invoiced on <span className="font-semibold">{entry.invoiceNumber}</span> — time and rate fields are locked.</>
              }
            </p>
          </div>
        )}

        {/* Date */}
        <FormField label="Date" error={errors.date} required>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            disabled={isInvoiced}
            className={inputCls(errors.date, isInvoiced)}
          />
        </FormField>

        {/* Time row */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Time In" error={errors.timeIn} required>
            <input
              type="time"
              value={form.timeIn}
              onChange={(e) => set('timeIn', e.target.value)}
              disabled={isInvoiced}
              className={inputCls(errors.timeIn, isInvoiced)}
            />
          </FormField>
          <FormField label="Time Out" error={errors.timeOut} required>
            <input
              type="time"
              value={form.timeOut}
              onChange={(e) => set('timeOut', e.target.value)}
              disabled={isInvoiced}
              className={inputCls(errors.timeOut, isInvoiced)}
            />
          </FormField>
        </div>

        {/* Break + Hours row */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Break (minutes)">
            <input
              type="number"
              value={form.breakMinutes}
              onChange={(e) => set('breakMinutes', e.target.value)}
              disabled={isInvoiced}
              min="0"
              className={inputCls(null, isInvoiced)}
            />
          </FormField>
          <FormField label="Working Hours">
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 font-mono text-amber-400 min-h-[48px] flex items-center">
              {decimalToHHMM(workingHours)}
            </div>
          </FormField>
        </div>

        {/* Rate */}
        <FormField label="Hourly Rate (AUD)" error={errors.hourlyRate} required>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-mono">$</span>
            <input
              type="number"
              value={form.hourlyRate}
              onChange={(e) => set('hourlyRate', e.target.value)}
              disabled={isInvoiced}
              step="0.01"
              min="0"
              className={`${inputCls(errors.hourlyRate, isInvoiced)} pl-8`}
            />
          </div>
        </FormField>

        {/* Earnings display */}
        {workingHours > 0 && (
          <div className="bg-zinc-800/40 rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-zinc-400">Earnings</span>
            <span className="font-mono text-lg font-semibold text-zinc-50">{formatCurrency(earnings)}</span>
          </div>
        )}

        {/* Profile quick-fill chips */}
        {(() => {
          const profiles = settings?.jobProfiles || [];
          if (profiles.length < 2) return null;
          return (
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Quick-fill from profile</p>
              <div className="flex flex-wrap gap-2">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setForm((prev) => ({
                      ...prev,
                      projectName: p.projectName || '',
                      clientName: p.clientName || '',
                      hourlyRate: String(p.hourlyRate || ''),
                    }))}
                    className="px-3 py-1.5 rounded-xl text-sm font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-amber-400/60 hover:text-amber-400 transition-colors"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Project + Client */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Project">
            <input
              type="text"
              value={form.projectName}
              onChange={(e) => set('projectName', e.target.value)}
              className={inputCls()}
              placeholder="Project"
            />
          </FormField>
          <FormField label="Client">
            <input
              type="text"
              value={form.clientName}
              onChange={(e) => set('clientName', e.target.value)}
              className={inputCls()}
              placeholder="Client"
            />
          </FormField>
        </div>

        {/* Description */}
        <FormField label="Description">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="What did you work on?"
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 transition-colors resize-none"
          />
        </FormField>

        {/* Notes */}
        <FormField label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Additional notes"
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 transition-colors resize-none"
          />
        </FormField>

        {/* Status */}
        <FormField label="Payment Status">
          {isInvoiced ? (
            <div className={`bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-sm ${entry.status === 'paid_invoice' ? 'text-emerald-400' : 'text-blue-400'}`}>
              {entry.status === 'paid_invoice' ? `Paid via invoice ${entry.invoiceNumber}` : `Invoiced on ${entry.invoiceNumber}`}
            </div>
          ) : (
            <div className="segmented">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => set('status', opt.value)}
                  className={form.status === opt.value ? 'active' : ''}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </FormField>

        {/* Billable toggle */}
        <label className="flex items-center justify-between py-2 cursor-pointer">
          <span className="text-sm font-medium text-zinc-300">Billable</span>
          <div
            onClick={() => set('billable', !form.billable)}
            className={`relative w-11 h-6 rounded-full transition-colors ${form.billable ? 'bg-amber-400' : 'bg-zinc-700'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow ${form.billable ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </label>

        {/* Action buttons */}
        <div className="pt-2 pb-2 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 font-bold rounded-xl py-3.5 text-base transition-colors min-h-[52px]"
          >
            {saving ? 'Saving…' : isClockOut ? 'Save & Clock Out' : isEdit ? 'Update Entry' : 'Add Entry'}
          </button>

          {isEdit && (
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex-1 flex items-center justify-center gap-2 border border-red-400/30 text-red-400 hover:bg-red-400/8 active:bg-red-400/15 rounded-xl py-3 min-h-[48px] transition-colors text-sm font-medium"
              >
                <Trash2 size={15} />
                Delete
              </button>
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 border border-zinc-700 text-zinc-400 hover:bg-zinc-800 active:bg-zinc-700 rounded-xl py-3 min-h-[48px] transition-colors text-sm font-medium"
              >
                <Copy size={15} />
                Duplicate
              </button>
            </div>
          )}

          <ConfirmModal
            isOpen={confirmingDelete}
            icon="danger"
            title="Delete this entry?"
            message="This cannot be undone."
            confirmLabel="Delete"
            cancelLabel="Keep"
            onConfirm={handleDelete}
            onCancel={() => setConfirmingDelete(false)}
            loading={deleting}
          />
        </div>
      </div>
    </BottomSheet>
  );
}

function FormField({ label, error, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-400 mb-1.5">
        {label}{required && <span className="text-amber-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function inputCls(error, disabled) {
  return `w-full bg-zinc-800 border ${error ? 'border-red-400' : 'border-zinc-700'} rounded-xl px-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 transition-colors min-h-[48px] ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;
}
