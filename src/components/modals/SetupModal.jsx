import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { generateId } from '../../lib/utils';

export default function SetupModal({ onComplete }) {
  const { addToast } = useApp();
  const [form, setForm] = useState({
    businessName: '',
    abn: '',
    defaultClientName: '',
    defaultHourlyRate: '',
    bsb: '',
    accountNumber: '',
    bankName: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.businessName.trim()) e.businessName = 'Required';
    if (!form.defaultClientName.trim()) e.defaultClientName = 'Required';
    if (!form.defaultHourlyRate || isNaN(Number(form.defaultHourlyRate)) || Number(form.defaultHourlyRate) <= 0) {
      e.defaultHourlyRate = 'Enter a valid rate';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const profileId = generateId();
      const defaultProfile = {
        id: profileId,
        name: form.defaultClientName.trim(),
        clientName: form.defaultClientName.trim(),
        projectName: 'General Labour',
        hourlyRate: Number(form.defaultHourlyRate),
      };

      const config = {
        businessName: form.businessName.trim(),
        abn: form.abn.replace(/\D/g, ''),
        address: '',
        suburb: '',
        state: 'NSW',
        postcode: '',
        // Legacy fields kept for backward compatibility
        defaultClientName: form.defaultClientName.trim(),
        defaultProjectName: 'General Labour',
        defaultHourlyRate: Number(form.defaultHourlyRate),
        // Job profiles
        jobProfiles: [defaultProfile],
        defaultProfileId: profileId,
        // Invoice settings
        invoicePrefix: 'INV-',
        startingInvoiceNumber: 1,
        paymentTermsDays: 14,
        gstRegistered: false,
        bankName: form.bankName.trim(),
        bsb: form.bsb.trim(),
        accountNumber: form.accountNumber.trim(),
        paymentNotes: [
          form.bankName && `Bank: ${form.bankName}`,
          form.bsb && `BSB: ${form.bsb}`,
          form.accountNumber && `Account: ${form.accountNumber}`,
          'Please use your invoice number as the payment reference.',
        ].filter(Boolean).join('\n'),
        firstDayOfWeek: 'mon',
        dailyHourTarget: 8,
      };

      await window.storage.set('settings:config', config);
      await window.storage.set('settings:invoice-counter', 0);
      addToast('Welcome to TimeSheet!', 'success');
      onComplete(config);
    } catch (err) {
      addToast('Setup failed. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-amber-400/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">⏱</span>
            </div>
            <h1 className="text-xl font-bold text-zinc-50">Welcome to TimeSheet</h1>
            <p className="text-sm text-zinc-400 mt-1">Let's get you set up in 30 seconds</p>
          </div>

          {/* Fields */}
          <div className="space-y-4">
            <Field
              label="Your Name or Business Name"
              required
              value={form.businessName}
              onChange={(v) => set('businessName', v)}
              placeholder="e.g. Jordan's Painting"
              error={errors.businessName}
            />
            <Field
              label="ABN"
              value={form.abn}
              onChange={(v) => set('abn', v)}
              placeholder="e.g. 51 824 753 556"
              hint="Optional — shown on invoices"
            />
            <Field
              label="Default Client Name"
              required
              value={form.defaultClientName}
              onChange={(v) => set('defaultClientName', v)}
              placeholder="e.g. Smith Constructions"
              error={errors.defaultClientName}
            />
            <Field
              label="Hourly Rate (AUD)"
              required
              type="number"
              value={form.defaultHourlyRate}
              onChange={(v) => set('defaultHourlyRate', v)}
              placeholder="e.g. 35"
              error={errors.defaultHourlyRate}
            />

            <div className="border-t border-zinc-800 pt-4">
              <p className="text-xs text-zinc-500 mb-3 uppercase tracking-widest">Bank Details (optional)</p>
              <div className="space-y-3">
                <Field
                  label="Bank Name"
                  value={form.bankName}
                  onChange={(v) => set('bankName', v)}
                  placeholder="e.g. Commonwealth Bank"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="BSB"
                    value={form.bsb}
                    onChange={(v) => set('bsb', v)}
                    placeholder="062-000"
                  />
                  <Field
                    label="Account Number"
                    value={form.accountNumber}
                    onChange={(v) => set('accountNumber', v)}
                    placeholder="12345678"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="mt-6 w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 font-bold rounded-xl py-3.5 text-base transition-colors min-h-[52px]"
          >
            {saving ? 'Setting up…' : 'Get Started →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, value, onChange, placeholder, error, hint, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
        {label}{required && <span className="text-amber-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-zinc-800 border ${error ? 'border-red-400' : 'border-zinc-700'} rounded-xl px-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 transition-colors min-h-[48px]`}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}
