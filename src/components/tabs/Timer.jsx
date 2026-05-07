import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import EntryModal from '../modals/EntryModal';

import {
  decimalToHHMM, formatCurrency,
  secondsToHHMMSS, todayStr, getDateRange, sumHours, sumEarnings,
  isInRange, getDefaultProfile
} from '../../lib/utils';
import { Play, Pause, Square, Plus, ChevronRight, Bell, BellOff } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function TimerTab() {
  const {
    settings, timer,
    startTimer, pauseTimer, resumeTimer, stopTimer,
    pendingClockOutConfirm, clearClockOutConfirm,
    addToast, refreshKey, setActiveTab
  } = useApp();

  const [todayEntries, setTodayEntries] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);
  const [weekEntries, setWeekEntries] = useState([]);
  const [statPeriod, setStatPeriod] = useState('week');
  const [recentEntries, setRecentEntries] = useState([]);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [liveTime, setLiveTime] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [notifPerm, setNotifPerm] = useState(() =>
    ('Notification' in window) ? Notification.permission : 'unsupported'
  );

  const profiles = settings?.jobProfiles || [];
  const effectiveProfileId = selectedProfileId || settings?.defaultProfileId || profiles[0]?.id;
  const selectedProfile = profiles.find((p) => p.id === effectiveProfileId) || getDefaultProfile(settings);

  // Live clock for idle state
  useEffect(() => {
    const tick = () => setLiveTime(format(new Date(), 'h:mm a'));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Live elapsed display
  useEffect(() => {
    if (!timer) { setElapsed('00:00:00'); return; }
    const update = () => {
      const secs = timer.isRunning && !timer.isPaused
        ? timer.elapsedSeconds + (Date.now() - timer.sessionStart) / 1000
        : timer.elapsedSeconds;
      setElapsed(secondsToHHMMSS(secs));
    };
    update();
    const id = setInterval(update, 250);
    return () => clearInterval(id);
  }, [timer]);

  const loadData = useCallback(async () => {
    const today = todayStr();
    const { start: monthStart, end: monthEnd } = getDateRange('month');
    const allItems = await window.storage.getAll('entries:');
    const allEntries = allItems.map((i) => i.value).filter(Boolean);
    const tEntries = allEntries.filter((e) => e.date === today).sort((a, b) => b.timeIn.localeCompare(a.timeIn));
    const mEntries = allEntries.filter((e) => isInRange(e.date, monthStart, monthEnd));
    const { start: weekStart, end: weekEnd } = getDateRange('week');
    const wEntries = allEntries.filter((e) => isInRange(e.date, weekStart, weekEnd));
    setTodayEntries(tEntries);
    setMonthEntries(mEntries);
    setWeekEntries(wEntries);
    const recent = [...allEntries].sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.timeIn.localeCompare(a.timeIn);
    }).slice(0, 5);
    setRecentEntries(recent);
  }, []);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  const handleRequestNotifPerm = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === 'granted') addToast('Timer notifications enabled', 'success');
  };

  const handlePunchIn = async () => {
    // Must request permission here, directly in the tap handler (Android requirement)
    if ('Notification' in window && Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      setNotifPerm(perm);
    }
    await startTimer({
      projectName: selectedProfile?.projectName,
      clientName: selectedProfile?.clientName,
      hourlyRate: selectedProfile?.hourlyRate,
    });
    addToast('Timer started', 'success');
  };

  const [showClockOutEntry, setShowClockOutEntry] = useState(false);
  const [clockOutPrefill, setClockOutPrefill] = useState(null);

  const buildClockOutPrefill = () => ({
    date: timer?.clockInDate || todayStr(),
    timeIn: timer?.clockInTime || '',
    timeOut: format(new Date(), 'HH:mm'),
    hourlyRate: timer?.hourlyRate ?? selectedProfile?.hourlyRate ?? '',
    projectName: timer?.projectName || '',
    clientName: timer?.clientName || '',
    description: '',
    notes: '',
    billable: true,
  });

  const handleStopPress = () => {
    setClockOutPrefill(buildClockOutPrefill());
    setShowClockOutEntry(true);
  };

  const handleAfterClockOutSave = async () => {
    await stopTimer();
  };

  // When notification "Clock Out" action sets pendingClockOutConfirm, open entry modal
  useEffect(() => {
    if (pendingClockOutConfirm) {
      setClockOutPrefill(buildClockOutPrefill());
      setShowClockOutEntry(true);
      clearClockOutConfirm();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingClockOutConfirm]);

  // Include the running timer's elapsed time in live stats.
  // The component already re-renders every 250ms (elapsed interval) so
  // Date.now() - timer.sessionStart is effectively a live value.
  const liveSessionSecs = (() => {
    if (!timer?.isRunning || timer.clockInDate !== todayStr()) return 0;
    return timer.isPaused
      ? timer.elapsedSeconds
      : timer.elapsedSeconds + (Date.now() - timer.sessionStart) / 1000;
  })();
  const liveHours    = liveSessionSecs / 3600;
  const liveEarnings = liveHours * (timer?.hourlyRate || 0);

  const todayHours    = sumHours(todayEntries)    + liveHours;
  const todayEarnings = sumEarnings(todayEntries) + liveEarnings;
  const monthHours    = sumHours(monthEntries)    + liveHours;
  const monthEarnings = sumEarnings(monthEntries) + liveEarnings;
  const target = settings?.dailyHourTarget || 8;
  const progressPct = Math.min(100, (todayHours / target) * 100);
  // SVG ring: r=15, circumference ≈ 94.25
  const ringLen = 94.25;
  const ringFill = (progressPct / 100) * ringLen;

  const monthUnpaid = monthEntries.filter((e) => e.status === 'unpaid' && e.billable).reduce((s, e) => s + e.earnings, 0);
  const monthInvoiced = monthEntries.filter((e) => e.status === 'invoiced' && e.billable).reduce((s, e) => s + e.earnings, 0);
  const monthPaid = monthEntries.filter((e) => (e.status === 'paid_cash' || e.status === 'paid_invoice') && e.billable).reduce((s, e) => s + e.earnings, 0);

  const weekHours    = sumHours(weekEntries)    + liveHours;
  const weekEarnings = sumEarnings(weekEntries) + liveEarnings;
  const weekUnpaid   = weekEntries.filter((e) => e.status === 'unpaid' && e.billable).reduce((s, e) => s + e.earnings, 0);
  const weekInvoiced = weekEntries.filter((e) => e.status === 'invoiced' && e.billable).reduce((s, e) => s + e.earnings, 0);
  const weekPaid     = weekEntries.filter((e) => (e.status === 'paid_cash' || e.status === 'paid_invoice') && e.billable).reduce((s, e) => s + e.earnings, 0);
  const { start: _ws, end: _we } = getDateRange('week');
  const weekLabel = `${format(parseISO(_ws), 'd MMM')} – ${format(parseISO(_we), 'd MMM')}`;

  return (
    <div className="scroll-area h-full px-4 py-4 space-y-3">

      {/* ── Notification permission banner ─────────────────────── */}
      {notifPerm === 'default' && 'serviceWorker' in navigator && (
        <button
          onClick={handleRequestNotifPerm}
          className="w-full flex items-center gap-3 bg-amber-400/8 border border-amber-400/25 rounded-2xl px-4 py-3 text-left hover:bg-amber-400/12 transition-colors"
        >
          <Bell size={16} className="text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-200">Enable timer notifications</p>
            <p className="text-xs text-zinc-500 mt-0.5">See a live timer in your notification shade while clocked in</p>
          </div>
          <ChevronRight size={14} className="text-zinc-600 shrink-0" />
        </button>
      )}
      {notifPerm === 'denied' && (
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3">
          <BellOff size={15} className="text-zinc-600 shrink-0" />
          <p className="text-xs text-zinc-500">Notifications blocked — enable in your browser/phone settings to get a live timer in your notification shade.</p>
        </div>
      )}

      {/* ── Timer Card ─────────────────────────────────────────── */}
      {timer ? (
        /* Active state */
        <div className="bg-zinc-900 rounded-2xl overflow-hidden" style={{ border: '1px solid rgb(251 191 36 / 0.25)', borderTop: '2px solid rgb(251 191 36 / 0.6)' }}>
          <div className="px-5 pt-4 pb-5">
            {/* Header row */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 timer-pulse" />
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Recording</span>
              </div>
              <span className="text-xs text-zinc-500 font-mono">Started {timer.clockInTime}</span>
            </div>

            {/* Elapsed */}
            <div className="text-center mb-5">
              <div className="font-mono text-[56px] font-bold text-zinc-50 tracking-tight leading-none tabular-nums">
                {elapsed}
              </div>
              {(timer.clientName || timer.projectName) && (
                <div className="mt-3 space-y-0.5">
                  {timer.clientName && (
                    <p className="text-zinc-200 text-sm font-semibold">{timer.clientName}</p>
                  )}
                  {timer.projectName && (
                    <p className="text-zinc-500 text-xs">{timer.projectName}</p>
                  )}
                </div>
              )}
              {timer.isPaused && (
                <span className="inline-block mt-3 text-xs bg-amber-400/15 text-amber-400 px-3 py-1 rounded-full font-semibold tracking-widest">
                  PAUSED
                </span>
              )}
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              <button
                onClick={timer.isPaused ? resumeTimer : pauseTimer}
                className="flex-1 flex items-center justify-center gap-2 border-2 border-amber-400/50 text-amber-400 hover:bg-amber-400/10 active:bg-amber-400/20 rounded-xl py-3.5 font-semibold min-h-[52px] transition-colors"
              >
                {timer.isPaused ? <Play size={17} /> : <Pause size={17} />}
                {timer.isPaused ? 'RESUME' : 'PAUSE'}
              </button>
              <button
                onClick={handleStopPress}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 active:bg-red-600 text-white rounded-xl py-3.5 font-semibold min-h-[52px] transition-colors"
              >
                <Square size={15} fill="currentColor" />
                STOP
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Idle state */
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          {/* Profile selector */}
          {profiles.length > 1 && (
            <div className="mb-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">Job Profile</p>
              <div className="flex flex-wrap gap-2">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProfileId(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                      effectiveProfileId === p.id
                        ? 'bg-amber-400 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected profile info */}
          {selectedProfile && (selectedProfile.clientName || selectedProfile.projectName) && (
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="min-w-0">
                <p className="text-sm text-zinc-300 font-medium truncate">
                  {selectedProfile.clientName}
                  {selectedProfile.clientName && selectedProfile.projectName && <span className="text-zinc-600"> · </span>}
                  {selectedProfile.projectName}
                </p>
              </div>
              {selectedProfile.hourlyRate > 0 && (
                <span className="text-xs font-mono text-amber-400/80 shrink-0 ml-2">${selectedProfile.hourlyRate}/hr</span>
              )}
            </div>
          )}

          {/* PUNCH IN button */}
          <button
            onClick={handlePunchIn}
            className="punch-btn w-full bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-zinc-950 font-bold rounded-2xl transition-transform duration-100"
          >
            <div className="flex flex-col items-center py-6 gap-1">
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span className="text-[22px] tracking-widest font-extrabold">PUNCH IN</span>
              </div>
              <span className="font-mono text-sm text-zinc-950/50 font-medium">{liveTime}</span>
            </div>
          </button>
        </div>
      )}

      {/* ── Today ──────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-4">
          {/* Ring progress */}
          <div className="relative w-14 h-14 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="#27272a" strokeWidth="3.5" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke="#f59e0b" strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${ringFill} ${ringLen}`}
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold text-amber-400 leading-none">{Math.round(progressPct)}%</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5 font-semibold">
              Today · {format(new Date(), 'EEE d MMM')}
            </p>
            <p className="font-mono text-2xl font-bold text-zinc-50">{decimalToHHMM(todayHours)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{decimalToHHMM(todayHours)} of {target}h target</p>
          </div>

          <div className="text-right shrink-0">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5 font-semibold">Earned</p>
            <p className="font-mono text-2xl font-bold text-amber-400">{formatCurrency(todayEarnings)}</p>
          </div>
        </div>
      </div>

      {/* ── Week / Month ───────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
            {statPeriod === 'week' ? weekLabel : format(new Date(), 'MMMM yyyy')}
          </p>
          <div className="flex rounded-lg bg-zinc-800 p-0.5">
            {(['week', 'month']).map((p) => (
              <button
                key={p}
                onClick={() => setStatPeriod(p)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  statPeriod === p ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-between items-start mb-3">
          <p className="font-mono text-2xl font-bold text-zinc-50">
            {decimalToHHMM(statPeriod === 'week' ? weekHours : monthHours)}
          </p>
          <div className="text-right">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5 font-semibold">Total Earned</p>
            <p className="font-mono text-2xl font-bold text-amber-400">
              {formatCurrency(statPeriod === 'week' ? weekEarnings : monthEarnings)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 pt-3 border-t border-zinc-800">
          <div className="text-center">
            <p className="font-mono text-sm font-semibold text-zinc-400">
              {formatCurrency(statPeriod === 'week' ? weekUnpaid : monthUnpaid)}
            </p>
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest mt-0.5 font-semibold">Unpaid</p>
          </div>
          <div className="text-center border-x border-zinc-800">
            <p className="font-mono text-sm font-semibold text-blue-400">
              {formatCurrency(statPeriod === 'week' ? weekInvoiced : monthInvoiced)}
            </p>
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest mt-0.5 font-semibold">Invoiced</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-sm font-semibold text-emerald-400">
              {formatCurrency(statPeriod === 'week' ? weekPaid : monthPaid)}
            </p>
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest mt-0.5 font-semibold">Paid</p>
          </div>
        </div>
      </div>

      {/* ── Recent Entries ─────────────────────────────────────── */}
      {recentEntries.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Recent Entries</p>
            <button
              onClick={() => setActiveTab('log')}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors min-h-[36px]"
            >
              View all <ChevronRight size={12} />
            </button>
          </div>
          {recentEntries.map((entry) => (
            <RecentEntryRow key={entry.key} entry={entry} onClick={() => setEditEntry(entry)} />
          ))}
        </div>
      )}

      {/* ── Add Manual Entry ───────────────────────────────────── */}
      <button
        onClick={() => setShowAddEntry(true)}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-zinc-700 hover:border-amber-400/40 text-zinc-500 hover:text-amber-400 rounded-2xl py-4 min-h-[52px] transition-colors text-sm font-medium"
      >
        <Plus size={16} />
        Add Manual Entry
      </button>

      <div className="h-4" />

      <EntryModal isOpen={showAddEntry} onClose={() => setShowAddEntry(false)} />
      <EntryModal
        isOpen={!!editEntry}
        entry={editEntry}
        onClose={() => { setEditEntry(null); loadData(); }}
      />

      <EntryModal
        isOpen={showClockOutEntry}
        prefill={clockOutPrefill}
        onAfterSave={handleAfterClockOutSave}
        onClose={() => setShowClockOutEntry(false)}
      />
    </div>
  );
}

const STATUS_COLORS = {
  unpaid: 'bg-amber-400',
  invoiced: 'bg-blue-400',
  paid_cash: 'bg-emerald-400',
  paid_invoice: 'bg-emerald-400',
};

function RecentEntryRow({ entry, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/40 active:bg-zinc-800/70 transition-colors text-left"
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[entry.status] || 'bg-zinc-600'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 font-medium truncate">
          {entry.description || entry.projectName || entry.clientName || 'Labour'}
        </p>
        <p className="font-mono text-xs text-zinc-500 mt-0.5">
          {entry.timeIn} – {entry.timeOut}
          {entry.clientName && !entry.description && entry.projectName && (
            <span className="text-zinc-600"> · {entry.clientName}</span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-mono text-sm font-semibold text-zinc-100">{formatCurrency(entry.earnings)}</p>
        <p className="font-mono text-xs text-zinc-500">{decimalToHHMM(entry.workingHours)}</p>
      </div>
    </button>
  );
}
