import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { formatABN, generateId, calcWorkingHours, calcEarnings, entryKey } from '../../lib/utils';
import BottomSheet from '../ui/BottomSheet';
import { Download, Upload, Trash2, ChevronDown, Plus, Star, FlaskConical } from 'lucide-react';
import { format, subDays } from 'date-fns';

const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

const SAMPLE_DESCRIPTIONS = [
  'General Labour', 'Site prep and clean-up', 'Painting exterior walls',
  'Interior prep work', 'Rendering', 'Pressure washing', 'Touch ups',
  'Material handling', 'Scaffolding setup',
];

export default function SettingsTab() {
  const { settings, reloadSettings, addToast, triggerRefresh } = useApp();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [clearConfirm, setClearConfirm] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [populating, setPopulating] = useState(false);

  // Profile editing state
  const [editingProfile, setEditingProfile] = useState(null);
  const [showProfileSheet, setShowProfileSheet] = useState(false);

  useEffect(() => {
    if (settings) setForm({ ...settings });
  }, [settings]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // ── Save full settings ────────────────────────────────────────
  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const profiles = form.jobProfiles || [];
      const defaultProfile = profiles.find((p) => p.id === form.defaultProfileId) || profiles[0];
      const toSave = {
        ...form,
        defaultClientName: defaultProfile?.clientName || '',
        defaultProjectName: defaultProfile?.projectName || '',
        defaultHourlyRate: defaultProfile?.hourlyRate || 0,
      };
      await window.storage.set('settings:config', toSave);
      await reloadSettings();
      addToast('Settings saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Profile helpers (auto-save immediately) ───────────────────
  const persistProfileChanges = async (newProfiles, newDefaultId) => {
    const defaultProf = newProfiles.find((p) => p.id === newDefaultId) || newProfiles[0];
    const toSave = {
      ...form,
      jobProfiles: newProfiles,
      defaultProfileId: newDefaultId,
      defaultClientName: defaultProf?.clientName || '',
      defaultProjectName: defaultProf?.projectName || '',
      defaultHourlyRate: defaultProf?.hourlyRate || 0,
    };
    await window.storage.set('settings:config', toSave);
    setForm(toSave);
    await reloadSettings();
  };

  const openAddProfile = () => {
    setEditingProfile({ id: null, name: '', clientName: '', clientAddress: '', projectName: '', hourlyRate: '' });
    setShowProfileSheet(true);
  };

  const openEditProfile = (profile) => {
    setEditingProfile({ ...profile, clientAddress: profile.clientAddress || '', hourlyRate: String(profile.hourlyRate || '') });
    setShowProfileSheet(true);
  };

  const handleSaveProfile = async (profileData) => {
    const profiles = form.jobProfiles || [];
    const id = profileData.id || generateId();
    const updated = {
      id,
      name: profileData.name.trim() || profileData.clientName.trim() || 'Unnamed',
      clientName: profileData.clientName.trim(),
      clientAddress: (profileData.clientAddress || '').trim(),
      projectName: profileData.projectName.trim(),
      hourlyRate: Number(profileData.hourlyRate) || 0,
    };
    const exists = profiles.find((p) => p.id === id);
    const newProfiles = exists
      ? profiles.map((p) => (p.id === id ? updated : p))
      : [...profiles, updated];

    let newDefaultId = form.defaultProfileId;
    if (!form.defaultProfileId || newProfiles.length === 1) newDefaultId = id;

    try {
      await persistProfileChanges(newProfiles, newDefaultId);
      addToast(exists ? 'Profile updated' : 'Profile added', 'success');
    } catch {
      addToast('Failed to save profile', 'error');
    }
    setShowProfileSheet(false);
  };

  const handleDeleteProfile = async (id) => {
    const newProfiles = (form.jobProfiles || []).filter((p) => p.id !== id);
    let newDefaultId = form.defaultProfileId;
    if (form.defaultProfileId === id && newProfiles.length > 0) newDefaultId = newProfiles[0].id;
    try {
      await persistProfileChanges(newProfiles, newDefaultId);
      addToast('Profile deleted', 'info');
    } catch {
      addToast('Failed to delete profile', 'error');
    }
  };

  const handleSetDefault = async (profileId) => {
    const profiles = form.jobProfiles || [];
    try {
      await persistProfileChanges(profiles, profileId);
      addToast('Default profile updated', 'success');
    } catch {
      addToast('Failed to update default', 'error');
    }
  };

  // ── Data management ───────────────────────────────────────────
  const handleExport = async () => {
    try {
      const allItems = await window.storage.getAll('');
      const blob = new Blob([JSON.stringify(allItems, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timesheet-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Data exported', 'success');
    } catch {
      addToast('Export failed', 'error');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      for (const item of data) {
        if (item.key && item.value !== undefined) {
          await window.storage.set(item.key, item.value);
        }
      }
      await reloadSettings();
      addToast('Data imported successfully', 'success');
    } catch {
      addToast('Import failed — invalid file', 'error');
    }
    e.target.value = '';
  };

  const handleClearAll = async () => {
    if (clearConfirm !== 'DELETE') return;
    try {
      await window.storage.clear();
      window.location.reload();
    } catch {
      addToast('Clear failed', 'error');
    }
  };

  // ── Test tools ────────────────────────────────────────────────
  const handlePopulateEntries = async () => {
    setPopulating(true);
    try {
      const profiles = settings?.jobProfiles || [];
      const profile = profiles.find((p) => p.id === settings?.defaultProfileId) || profiles[0];
      const rate = profile?.hourlyRate || 37;
      const client = profile?.clientName || 'Test Client';
      const project = profile?.projectName || 'General Labour';

      const today = new Date();
      let added = 0;

      for (let d = 20; d >= 0; d--) {
        const date = subDays(today, d);
        const dow = date.getDay(); // 0=Sun, 6=Sat
        if (dow === 0 || dow === 6) continue;

        const dateStr = format(date, 'yyyy-MM-dd');

        // Vary start times: 6am–7:30am
        const startH = 6 + Math.floor(Math.random() * 2);
        const startM = [0, 15, 30][Math.floor(Math.random() * 3)];
        const timeIn = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;

        // Work 7–9.5 hours
        const workMins = 420 + Math.floor(Math.random() * 150);
        const outTotal = startH * 60 + startM + workMins + 30; // +30 for break
        const timeOut = `${String(Math.floor(outTotal / 60) % 24).padStart(2, '0')}:${String(outTotal % 60).padStart(2, '0')}`;

        const workingHours = calcWorkingHours(timeIn, timeOut, 30);
        const earnings = calcEarnings(workingHours, rate);
        const description = d < 4
          ? SAMPLE_DESCRIPTIONS[Math.floor(Math.random() * SAMPLE_DESCRIPTIONS.length)]
          : '';

        // Status: oldest = paid, middle = invoiced, recent = unpaid
        let status = 'unpaid';
        let invoiceNumber = null;
        if (d >= 12) { status = 'paid_cash'; }
        else if (d >= 5) { status = 'invoiced'; invoiceNumber = 'INV-001'; }

        const id = generateId();
        const key = entryKey(dateStr, id);
        await window.storage.set(key, {
          id, key, date: dateStr, timeIn, timeOut,
          breakMinutes: 30, workingHours, hourlyRate: rate, earnings,
          projectName: project, clientName: client,
          description, notes: '', status, invoiceNumber, billable: true,
        });
        added++;
      }

      triggerRefresh();
      addToast(`Added ${added} sample entries`, 'success');
    } catch {
      addToast('Failed to populate entries', 'error');
    } finally {
      setPopulating(false);
    }
  };

  const handleClearEntries = async () => {
    try {
      const allItems = await window.storage.getAll('entries:');
      for (const item of allItems) {
        await window.storage.delete(item.key);
      }
      triggerRefresh();
      addToast('All entries cleared', 'info');
    } catch {
      addToast('Failed to clear entries', 'error');
    }
  };

  if (!form) {
    return <div className="flex items-center justify-center h-full text-zinc-500 text-sm">Loading…</div>;
  }

  const profiles = form.jobProfiles || [];

  return (
    <div className="h-full scroll-area px-4 py-4 space-y-6">

      {/* Your Business */}
      <Section title="Your Business">
        <Field label="Business / Trading Name">
          <Input value={form.businessName || ''} onChange={(v) => set('businessName', v)} placeholder="Your Business Name" />
        </Field>
        <Field label="ABN">
          <Input value={form.abn || ''} onChange={(v) => set('abn', v.replace(/\D/g, ''))} placeholder="51 824 753 556"
            display={form.abn ? formatABN(form.abn) : ''} />
        </Field>
        <Field label="Street Address">
          <Input value={form.address || ''} onChange={(v) => set('address', v)} placeholder="123 Main Street" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <Field label="Suburb">
              <Input value={form.suburb || ''} onChange={(v) => set('suburb', v)} placeholder="Sydney" />
            </Field>
          </div>
          <div>
            <Field label="State">
              <Select value={form.state || 'NSW'} onChange={(v) => set('state', v)} options={STATES} />
            </Field>
          </div>
          <div>
            <Field label="Postcode">
              <Input value={form.postcode || ''} onChange={(v) => set('postcode', v)} placeholder="2000" />
            </Field>
          </div>
        </div>
      </Section>

      {/* Job Profiles */}
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3 font-medium">Job Profiles</p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {profiles.length === 0 ? (
            <p className="text-sm text-zinc-500 px-4 py-4 text-center">No profiles yet — add one below</p>
          ) : (
            profiles.map((profile, idx) => (
              <div
                key={profile.id}
                className={`px-4 py-3 flex items-center gap-3 ${idx < profiles.length - 1 ? 'border-b border-zinc-800' : ''}`}
              >
                {/* Default star — auto-saves on tap */}
                <button
                  onClick={() => handleSetDefault(profile.id)}
                  className="shrink-0 transition-colors min-w-[28px]"
                  title={form.defaultProfileId === profile.id ? 'Default profile' : 'Set as default'}
                >
                  <Star
                    size={17}
                    className={form.defaultProfileId === profile.id
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-zinc-600 hover:text-zinc-400'}
                  />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-200 truncate">{profile.name}</p>
                    {form.defaultProfileId === profile.id && (
                      <span className="text-[9px] font-bold bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">Default</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {[profile.clientName, profile.projectName].filter(Boolean).join(' · ')}
                    {profile.hourlyRate > 0 && <span className="text-zinc-600"> · ${profile.hourlyRate}/hr</span>}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditProfile(profile)}
                    className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1.5 min-h-[36px] transition-colors"
                  >
                    Edit
                  </button>
                  {profiles.length > 1 && (
                    <button
                      onClick={() => handleDeleteProfile(profile.id)}
                      className="text-xs text-red-400/60 hover:text-red-400 px-2 py-1.5 min-h-[36px] transition-colors"
                    >
                      Del
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          <div className={profiles.length > 0 ? 'border-t border-zinc-800' : ''}>
            <button
              onClick={openAddProfile}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-amber-400 hover:bg-zinc-800/60 min-h-[48px] transition-colors"
            >
              <Plus size={15} />
              Add Profile
            </button>
          </div>
        </div>
        <p className="text-xs text-zinc-600 mt-2 px-1">
          Tap ★ to set default — saves immediately. Used when punching in and adding entries.
        </p>
      </div>

      {/* Invoice Settings */}
      <Section title="Invoice Settings">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice Prefix">
            <Input value={form.invoicePrefix || 'INV-'} onChange={(v) => set('invoicePrefix', v)} placeholder="INV-" />
          </Field>
          <Field label="Start Number">
            <Input type="number" value={String(form.startingInvoiceNumber || 1)} onChange={(v) => set('startingInvoiceNumber', Number(v) || 1)} placeholder="1" />
          </Field>
        </div>
        <Field label="Payment Terms (days)">
          <Input type="number" value={String(form.paymentTermsDays || 14)} onChange={(v) => set('paymentTermsDays', Number(v) || 14)} placeholder="14" />
        </Field>
        <label className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-zinc-300">GST Registered</p>
            <p className="text-xs text-zinc-500 mt-0.5">Adds 10% GST to invoices</p>
          </div>
          <Toggle value={form.gstRegistered || false} onChange={(v) => set('gstRegistered', v)} />
        </label>
        <Field label="Bank Name">
          <Input value={form.bankName || ''} onChange={(v) => set('bankName', v)} placeholder="Commonwealth Bank" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="BSB">
            <Input value={form.bsb || ''} onChange={(v) => set('bsb', v)} placeholder="062-000" />
          </Field>
          <Field label="Account Number">
            <Input value={form.accountNumber || ''} onChange={(v) => set('accountNumber', v)} placeholder="12345678" />
          </Field>
        </div>
        <Field label="Payment Notes">
          <textarea
            value={form.paymentNotes || ''}
            onChange={(e) => set('paymentNotes', e.target.value)}
            rows={3}
            placeholder="Payment instructions shown on invoices…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors resize-none"
          />
        </Field>
      </Section>

      {/* App Settings */}
      <Section title="App Settings">
        <Field label="First Day of Week">
          <Select
            value={form.firstDayOfWeek || 'mon'}
            onChange={(v) => set('firstDayOfWeek', v)}
            options={[{ value: 'mon', label: 'Monday' }, { value: 'sun', label: 'Sunday' }]}
            labelKey="label"
            valueKey="value"
          />
        </Field>
        <Field label="Daily Hour Target">
          <Input type="number" value={String(form.dailyHourTarget || 8)} onChange={(v) => set('dailyHourTarget', Number(v) || 8)} placeholder="8" />
        </Field>
      </Section>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 font-bold rounded-xl py-3.5 min-h-[52px] transition-colors"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>

      {/* Data section */}
      <Section title="Data">
        <button
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 rounded-xl py-3.5 min-h-[52px] text-sm font-medium transition-colors"
        >
          <Download size={16} />
          Export all data as JSON
        </button>
        <label className="w-full flex items-center justify-center gap-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 rounded-xl py-3.5 min-h-[52px] text-sm font-medium transition-colors cursor-pointer">
          <Upload size={16} />
          Import from JSON
          <input type="file" accept=".json" onChange={handleImport} className="hidden" />
        </label>
        <button
          onClick={() => setShowClearDialog(true)}
          className="w-full flex items-center justify-center gap-2 border border-red-400/40 text-red-400 hover:bg-red-400/10 rounded-xl py-3.5 min-h-[52px] text-sm font-medium transition-colors"
        >
          <Trash2 size={16} />
          Clear All Data
        </button>
      </Section>

      {/* Testing tools */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical size={13} className="text-zinc-500" />
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium">Testing</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <button
            onClick={handlePopulateEntries}
            disabled={populating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm text-zinc-300 hover:bg-zinc-800/60 disabled:opacity-50 min-h-[52px] transition-colors border-b border-zinc-800"
          >
            <Plus size={15} className="text-emerald-400" />
            {populating ? 'Populating…' : 'Populate 3 weeks of sample entries'}
          </button>
          <button
            onClick={handleClearEntries}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-red-400 min-h-[52px] transition-colors"
          >
            <Trash2 size={15} />
            Clear entries only (keeps settings)
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-2 px-1">Uses your default profile's rate and client.</p>
      </div>

      {/* Clear data dialog */}
      {showClearDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-zinc-900 border border-red-400/30 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-bold text-red-400 mb-2">Clear All Data</h3>
            <p className="text-sm text-zinc-400 mb-4">
              This will permanently delete everything including settings. Type <strong className="text-zinc-200">DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              value={clearConfirm}
              onChange={(e) => setClearConfirm(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 text-sm mb-4 focus:outline-none focus:border-red-400 min-h-[48px]"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowClearDialog(false); setClearConfirm(''); }}
                className="flex-1 border border-zinc-700 text-zinc-400 rounded-xl py-3 min-h-[48px] text-sm">
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearConfirm !== 'DELETE'}
                className="flex-1 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-bold rounded-xl py-3 min-h-[48px] text-sm transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-4" />

      {/* Profile edit sheet */}
      <BottomSheet
        isOpen={showProfileSheet}
        onClose={() => setShowProfileSheet(false)}
        title={editingProfile?.id ? 'Edit Profile' : 'Add Profile'}
      >
        {editingProfile && (
          <ProfileForm
            profile={editingProfile}
            onSave={handleSaveProfile}
            onClose={() => setShowProfileSheet(false)}
          />
        )}
      </BottomSheet>
    </div>
  );
}

function ProfileForm({ profile, onSave, onClose }) {
  const [form, setForm] = useState({ ...profile });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.clientName.trim() && !form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="px-5 py-4 space-y-4">
      <Field label="Profile Label">
        <input
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Smith Constructions — Labour"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 min-h-[48px]"
        />
      </Field>
      <Field label="Client Name">
        <input
          type="text"
          value={form.clientName}
          onChange={(e) => set('clientName', e.target.value)}
          placeholder="e.g. Smith Constructions"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 min-h-[48px]"
        />
      </Field>
      <Field label="Client Address">
        <textarea
          value={form.clientAddress || ''}
          onChange={(e) => set('clientAddress', e.target.value)}
          placeholder={"18 Example St\nSydney NSW 2000"}
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 resize-none"
        />
      </Field>
      <Field label="Project / Job">
        <input
          type="text"
          value={form.projectName}
          onChange={(e) => set('projectName', e.target.value)}
          placeholder="e.g. General Labour"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 min-h-[48px]"
        />
      </Field>
      <Field label="Hourly Rate (AUD)">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-mono">$</span>
          <input
            type="number"
            value={form.hourlyRate}
            onChange={(e) => set('hourlyRate', e.target.value)}
            placeholder="37"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 min-h-[48px]"
          />
        </div>
      </Field>
      <div className="pt-2 space-y-3">
        <button
          onClick={handleSave}
          className="w-full bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold rounded-xl py-3.5 min-h-[52px] transition-colors"
        >
          Save Profile
        </button>
        <button
          onClick={onClose}
          className="w-full text-zinc-400 hover:text-zinc-200 py-2 min-h-[44px] text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3 font-medium">{title}</p>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', className = '', display }) {
  return (
    <input
      type={type}
      value={display !== undefined ? display : value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-amber-400 transition-colors min-h-[48px] ${className}`}
    />
  );
}

function Select({ value, onChange, options, labelKey, valueKey }) {
  const isObj = typeof options[0] === 'object';
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-50 text-sm focus:outline-none focus:border-amber-400 transition-colors min-h-[48px] pr-10"
      >
        {options.map((opt) => {
          const v = isObj ? opt[valueKey || 'value'] : opt;
          const l = isObj ? opt[labelKey || 'label'] : opt;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${value ? 'bg-amber-400' : 'bg-zinc-700'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </div>
  );
}
