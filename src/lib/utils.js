import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, getISOWeek, addDays, eachDayOfInterval,
  isWithinInterval, differenceInCalendarDays, getDay } from 'date-fns';

// ── ID generation ─────────────────────────────────────────────
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export function generateId(len = 10) {
  let id = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (const byte of arr) id += CHARS[byte % CHARS.length];
  return id;
}

// ── Time / Hours ──────────────────────────────────────────────
/** "07:30", "15:45" → decimal hours */
export function timeStrToDecimalHours(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h + m / 60;
}

/** decimal hours → "HH:MM" */
export function decimalToHHMM(decimal) {
  if (decimal == null || isNaN(decimal) || decimal < 0) return '00:00';
  const totalMins = Math.round(decimal * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** seconds → "HH:MM:SS" */
export function secondsToHHMMSS(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** "07:30", "15:45", breakMins → decimal hours */
export function calcWorkingHours(timeIn, timeOut, breakMinutes = 0) {
  if (!timeIn || !timeOut) return 0;
  const inDec = timeStrToDecimalHours(timeIn);
  let outDec = timeStrToDecimalHours(timeOut);
  if (outDec < inDec) outDec += 24; // crosses midnight (strict: equal times = 0h, not 24h)
  const totalHours = outDec - inDec - (breakMinutes / 60);
  return Math.max(0, totalHours);
}

/** decimal hours × rate → rounded to 2dp */
export function calcEarnings(hours, rate) {
  return Math.round(hours * rate * 100) / 100;
}

// ── Currency / Formatting ─────────────────────────────────────
export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '$0.00';
  return '$' + Number(amount).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatABN(abn) {
  if (!abn) return '';
  const digits = abn.replace(/\D/g, '');
  if (digits.length !== 11) return abn;
  return `${digits.slice(0,2)} ${digits.slice(2,5)} ${digits.slice(5,8)} ${digits.slice(8,11)}`;
}

export function formatInvoiceNumber(prefix, counter) {
  return `${prefix}${String(counter).padStart(3, '0')}`;
}

// ── Date helpers ──────────────────────────────────────────────
export function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatDateDisplay(dateStr) {
  // "2024-11-28" → "Mon 28 Nov"
  return format(parseISO(dateStr), 'EEE d MMM');
}

export function formatDateFull(dateStr) {
  return format(parseISO(dateStr), 'dd/MM/yyyy');
}

export function formatDateLong(dateStr) {
  // "2024-11-28" → "28 Nov 2024"
  return format(parseISO(dateStr), 'd MMM yyyy');
}

export function currentMonthLabel() {
  return format(new Date(), 'MMMM yyyy');
}

export function getDateRange(period, refDate = new Date()) {
  switch (period) {
    case 'day':
      return { start: format(refDate, 'yyyy-MM-dd'), end: format(refDate, 'yyyy-MM-dd') };
    case 'week': {
      const s = startOfWeek(refDate, { weekStartsOn: 1 });
      const e = endOfWeek(refDate, { weekStartsOn: 1 });
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd') };
    }
    case 'month': {
      const s = startOfMonth(refDate);
      const e = endOfMonth(refDate);
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd') };
    }
    case 'year': {
      const s = startOfYear(refDate);
      const e = endOfYear(refDate);
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd') };
    }
    default:
      return { start: format(refDate, 'yyyy-MM-dd'), end: format(refDate, 'yyyy-MM-dd') };
  }
}

export function isInRange(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

export function getWeekNumber(dateStr) {
  return getISOWeek(parseISO(dateStr));
}

export function getDaysInMonth(year, month) {
  // Returns array of date strings for the month, padded to start on Monday
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (getDay(firstDay) + 6) % 7; // Mon=0
  const days = [];
  for (let i = 0; i < startPad; i++) {
    days.push(null);
  }
  const allDays = eachDayOfInterval({ start: firstDay, end: lastDay });
  for (const d of allDays) {
    days.push(format(d, 'yyyy-MM-dd'));
  }
  // Pad end to complete last row
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export function addDaysToDate(dateStr, n) {
  return format(addDays(parseISO(dateStr), n), 'yyyy-MM-dd');
}

// ── Entry helpers ─────────────────────────────────────────────
export function entryKey(dateStr, id) {
  return `entries:${dateStr}-${id}`;
}

export function parseEntryKey(key) {
  // "entries:2024-11-28-ABC123" → { date: "2024-11-28", id: "ABC123" }
  const without = key.replace('entries:', '');
  const date = without.slice(0, 10);
  const id = without.slice(11);
  return { date, id };
}

export function statusLabel(status) {
  switch (status) {
    case 'unpaid': return 'UNPAID';
    case 'invoiced': return 'INVOICED';
    case 'paid_cash': return 'PAID CASH';
    case 'paid_invoice': return 'PAID (INV)';
    default: return status?.toUpperCase() ?? '';
  }
}

export function statusColor(status) {
  switch (status) {
    case 'unpaid': return 'text-zinc-500';
    case 'invoiced': return 'text-blue-400';
    case 'paid_cash': return 'text-emerald-400';
    case 'paid_invoice': return 'text-emerald-400';
    default: return 'text-zinc-500';
  }
}

export function statusDotColor(status) {
  switch (status) {
    case 'unpaid': return 'bg-amber-400';
    case 'invoiced': return 'bg-blue-400';
    case 'paid_cash': return 'bg-emerald-400';
    case 'paid_invoice': return 'bg-emerald-400';
    default: return 'bg-zinc-500';
  }
}

// ── Stats helpers ─────────────────────────────────────────────
export function groupEntriesByDate(entries) {
  const groups = {};
  for (const e of entries) {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  }
  return groups;
}

export function sumHours(entries) {
  return entries.reduce((s, e) => s + (e.workingHours || 0), 0);
}

export function sumEarnings(entries) {
  return entries.reduce((s, e) => s + (e.billable ? (e.earnings || 0) : 0), 0);
}

export function currentTimeStr() {
  return format(new Date(), 'HH:mm');
}

// Returns the active default job profile from settings
export function getDefaultProfile(settings) {
  if (!settings) return { id: null, name: '', clientName: '', projectName: '', hourlyRate: 0 };
  const profiles = settings.jobProfiles || [];
  if (profiles.length > 0) {
    return profiles.find((p) => p.id === settings.defaultProfileId) || profiles[0];
  }
  // Legacy fallback for old settings format
  return {
    id: null,
    name: settings.defaultClientName || 'Default',
    clientName: settings.defaultClientName || '',
    projectName: settings.defaultProjectName || '',
    hourlyRate: settings.defaultHourlyRate || 0,
  };
}

// Groups invoice entries by (description || projectName) + hourlyRate for cleaner invoices
export function groupInvoiceEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const desc = (entry.description || '').trim() || entry.projectName || 'Labour';
    const key = `${desc}|||${entry.hourlyRate}`;
    if (!groups.has(key)) {
      groups.set(key, { desc, rate: entry.hourlyRate, hours: 0, earnings: 0, dates: [] });
    }
    const g = groups.get(key);
    g.hours += entry.workingHours;
    g.earnings += entry.earnings;
    g.dates.push(entry.date);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    sortedDates: [...g.dates].sort(),
  }));
}
