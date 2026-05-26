import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  secondsToHHMMSS, currentTimeStr, todayStr,
  generateId, getDefaultProfile, calcEarnings, entryKey,
} from '../lib/utils';
import * as orgApi from '../lib/orgApi';

// Get SW registration — use cached global first, fall back to navigator.serviceWorker.ready
async function getSwReg() {
  if (window.__swReg?.active) return window.__swReg;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('SW not ready after 4s')), 4000)),
  ]);
}

async function showTimerNotification(timerData) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const reg = await getSwReg();
    const isPaused = timerData.isPaused;
    const elapsed = secondsToHHMMSS(
      timerData.isRunning && !isPaused
        ? timerData.elapsedSeconds + (Date.now() - timerData.sessionStart) / 1000
        : timerData.elapsedSeconds
    );

    // Layout: title = elapsed time (renders bold/large); body = times + project
    const title = isPaused ? `⏸  ${elapsed}` : elapsed;
    const nowStr = currentTimeStr();
    const line1 = `${timerData.clockInTime}  ·  ${nowStr}`;
    const nameParts = [timerData.clientName, timerData.projectName].filter(Boolean);
    const line2 = nameParts.join('  ·  ');
    const body = [isPaused ? 'PAUSED' : null, line1, line2 || null]
      .filter(Boolean).join('\n');

    const actions = isPaused
      ? [{ action: 'resume', title: '▶  Resume'   }, { action: 'stop', title: '■  Clock Out' }]
      : [{ action: 'pause',  title: '⏸  Pause'    }, { action: 'stop', title: '■  Clock Out' }];

    await reg.showNotification('TimeSheet', {
      body,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: 'timer-active',
      renotify: false,
      silent: true,
      requireInteraction: true,
      actions,
    });
  } catch (e) {
    console.warn('[TimeSheet] Notification failed:', e?.message || e);
  }
}

async function closeTimerNotification() {
  if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
  try {
    const reg = await getSwReg();
    const notifs = await reg.getNotifications({ tag: 'timer-active' });
    notifs.forEach((n) => n.close());
  } catch {}
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'timer');
  const [toasts, setToasts] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingClockOutConfirm, setPendingClockOutConfirm] = useState(false);

  // Timer state
  const [timer, setTimer] = useState(null);
  const tickRef = useRef(null);
  const timerRef = useRef(null); // always-current copy for notification interval

  // ── Settings ────────────────────────────────────────────────
  const reloadSettings = useCallback(async () => {
    let s = await window.storage.get('settings:config');
    if (s && !s.jobProfiles) {
      const profile = {
        id: generateId(),
        name: s.defaultClientName || 'Default',
        clientName: s.defaultClientName || '',
        projectName: s.defaultProjectName || '',
        hourlyRate: s.defaultHourlyRate || 0,
      };
      s = { ...s, jobProfiles: [profile], defaultProfileId: profile.id };
      await window.storage.set('settings:config', s);
    }
    setSettings(s);
    return s;
  }, []);

  useEffect(() => {
    (async () => {
      await reloadSettings();
      const savedTimer = await window.storage.get('timer:active');
      if (savedTimer) {
        if (savedTimer.isRunning && !savedTimer.isPaused) {
          const extraSeconds = (Date.now() - savedTimer.sessionStart) / 1000;
          const restored = { ...savedTimer, elapsedSeconds: savedTimer.elapsedSeconds + extraSeconds };
          setTimer(restored);
          showTimerNotification(restored);
        } else {
          setTimer(savedTimer);
          if (savedTimer.isPaused) showTimerNotification(savedTimer);
        }
      }

      // Handle URL param set by SW when app was not running (e.g. stop_confirm)
      const params = new URLSearchParams(window.location.search);
      const pendingAction = params.get('pending_action') || params.get('timer_action');
      if (pendingAction) {
        window.history.replaceState({}, '', '/');
        if ((pendingAction === 'stop_confirm' || pendingAction === 'stop') && savedTimer) {
          setPendingClockOutConfirm(true);
        }
      }

      setIsLoadingSettings(false);
    })();
  }, [reloadSettings]);

  // Persist active tab
  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);

  // Keep timerRef in sync
  useEffect(() => { timerRef.current = timer; }, [timer]);

  // Tick interval
  useEffect(() => {
    if (timer?.isRunning && !timer?.isPaused) {
      tickRef.current = setInterval(() => {
        setTimer((prev) => {
          if (!prev || !prev.isRunning || prev.isPaused) return prev;
          const extra = (Date.now() - prev.sessionStart) / 1000;
          return { ...prev, elapsedSeconds: prev.elapsedSeconds + extra, sessionStart: Date.now() };
        });
      }, 1000);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [timer?.isRunning, timer?.isPaused]);

  // Notification refresh every 30s while running
  useEffect(() => {
    if (!timer?.isRunning || timer?.isPaused) return;
    const id = setInterval(() => {
      const t = timerRef.current;
      if (t?.isRunning && !t?.isPaused) showTimerNotification(t);
    }, 30000);
    return () => clearInterval(id);
  }, [timer?.isRunning, timer?.isPaused]);

  // Persist timer
  const persistTimer = useCallback(async (t) => {
    if (t) await window.storage.set('timer:active', t);
    else await window.storage.delete('timer:active');
  }, []);

  // ── Timer actions ────────────────────────────────────────────
  const startTimer = useCallback(async (opts = {}) => {
    const s = await window.storage.get('settings:config') || {};
    const defaultProfile = getDefaultProfile(s);
    const t = {
      isRunning: true,
      isPaused: false,
      elapsedSeconds: 0,
      sessionStart: Date.now(),
      clockInTime: currentTimeStr(),
      clockInDate: todayStr(),
      projectName: opts.projectName ?? defaultProfile.projectName ?? '',
      clientName: opts.clientName ?? defaultProfile.clientName ?? '',
      hourlyRate: opts.hourlyRate ?? defaultProfile.hourlyRate ?? 0,
      description: opts.description || '',
      checkedInJobId: opts.checkedInJobId || null,
      checkedInOrgId: opts.checkedInOrgId || null,
    };
    setTimer(t);
    await persistTimer(t);
    showTimerNotification(t);
  }, [persistTimer]);

  // Pause — use timerRef to read current value so we can run side effects
  // OUTSIDE the state updater (async calls in React updaters are unreliable).
  const pauseTimer = useCallback(async () => {
    const current = timerRef.current;
    if (!current || current.isPaused) return;
    const extra = (Date.now() - current.sessionStart) / 1000;
    const updated = {
      ...current,
      isPaused: true,
      isRunning: true,
      elapsedSeconds: current.elapsedSeconds + extra,
    };
    setTimer(updated);
    await persistTimer(updated);
    showTimerNotification(updated);
    // Close the current job check-in session while paused
    if (current.checkedInJobId) {
      try { await orgApi.checkOutFromJob(current.checkedInJobId); } catch {}
    }
  }, [persistTimer]);

  // Resume
  const resumeTimer = useCallback(async () => {
    const current = timerRef.current;
    if (!current || !current.isPaused) return;
    const updated = { ...current, isPaused: false, sessionStart: Date.now() };
    setTimer(updated);
    await persistTimer(updated);
    showTimerNotification(updated);
    // Start a new job check-in session when resuming
    if (current.checkedInJobId && current.checkedInOrgId) {
      try { await orgApi.checkInToJob(current.checkedInJobId, current.checkedInOrgId); } catch {}
    }
  }, [persistTimer]);

  const stopTimer = useCallback(async () => {
    const current = await window.storage.get('timer:active');
    if (!current) return null;
    const extra = current.isRunning && !current.isPaused
      ? (Date.now() - current.sessionStart) / 1000
      : 0;
    const finalElapsed = current.elapsedSeconds + extra;
    setTimer(null);
    await persistTimer(null);
    closeTimerNotification();
    return { ...current, elapsedSeconds: finalElapsed };
  }, [persistTimer]);

  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Full clock-out: stop timer + create time entry
  const clockOut = useCallback(async () => {
    const stopped = await stopTimer();
    if (!stopped) return null;
    const s = await window.storage.get('settings:config') || {};
    const totalSecs = stopped.elapsedSeconds;
    const totalMins = Math.floor(totalSecs / 60);
    const [h, m] = (stopped.clockInTime || '00:00').split(':').map(Number);
    const outTotalMins = h * 60 + m + totalMins;
    const outH = Math.floor(outTotalMins / 60) % 24;
    const outM = outTotalMins % 60;
    const timeOutStr = `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
    const workingHours = totalSecs / 3600;
    const rate = stopped.hourlyRate || s.defaultHourlyRate || 0;
    const earnings = calcEarnings(workingHours, rate);
    const id = generateId();
    const key = entryKey(stopped.clockInDate, id);
    const newEntry = {
      id, key,
      date: stopped.clockInDate,
      timeIn: stopped.clockInTime,
      timeOut: timeOutStr,
      breakMinutes: 0,
      workingHours,
      hourlyRate: rate,
      earnings,
      projectName: stopped.projectName || '',
      clientName: stopped.clientName || '',
      description: stopped.description || '',
      notes: '',
      status: 'unpaid',
      invoiceNumber: null,
      billable: true,
    };
    await window.storage.set(key, newEntry);
    triggerRefresh();
    return newEntry;
  }, [stopTimer, triggerRefresh]);

  const clearClockOutConfirm = useCallback(() => setPendingClockOutConfirm(false), []);

  const updateTimerField = useCallback(async (field, value) => {
    setTimer((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      persistTimer(updated);
      return updated;
    });
  }, [persistTimer]);

  // ── SW message listener (notification action buttons) ────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      const type = event.data?.type;
      if      (type === 'TIMER_PAUSE')        pauseTimer();
      else if (type === 'TIMER_RESUME')       resumeTimer();
      else if (type === 'TIMER_STOP_CONFIRM') {
        // "Clock Out" tapped from notification — focus app + show confirm dialog
        setPendingClockOutConfirm(true);
        setActiveTab('timer');
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [pauseTimer, resumeTimer]);

  // ── Toasts ───────────────────────────────────────────────────
  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Derived elapsed display
  const elapsedDisplay = timer
    ? secondsToHHMMSS(
        timer.isRunning && !timer.isPaused
          ? timer.elapsedSeconds + (Date.now() - timer.sessionStart) / 1000
          : timer.elapsedSeconds
      )
    : null;

  const value = {
    settings, setSettings, reloadSettings, isLoadingSettings,
    activeTab, setActiveTab,
    timer, elapsedDisplay,
    startTimer, pauseTimer, resumeTimer, stopTimer, clockOut, updateTimerField,
    pendingClockOutConfirm, clearClockOutConfirm,
    toasts, addToast, removeToast,
    refreshKey, triggerRefresh,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
