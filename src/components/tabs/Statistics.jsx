import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  getDateRange, isInRange, sumHours, sumEarnings, decimalToHHMM, formatCurrency,
  groupEntriesByDate
} from '../../lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { format, parseISO, eachDayOfInterval, eachWeekOfInterval, startOfWeek,
  endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays } from 'date-fns';

const PERIODS = ['week', 'month', 'year'];

export default function StatisticsTab() {
  const { refreshKey } = useApp();
  const [period, setPeriod] = useState('week');
  const [entries, setEntries] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [stats, setStats] = useState({ totalHours: 0, totalEarnings: 0, daysWorked: 0, avgHoursDay: 0 });
  const [breakdown, setBreakdown] = useState({ unpaid: 0, invoiced: 0, paid: 0 });
  const [patterns, setPatterns] = useState({ bestDay: '', longestSession: 0, streak: 0 });

  const loadData = useCallback(async () => {
    const { start, end } = getDateRange(period);
    const allItems = await window.storage.getAll('entries:');
    const all = allItems.map((i) => i.value).filter(Boolean);
    const periodEntries = all.filter((e) => isInRange(e.date, start, end));
    setEntries(periodEntries);

    // Summary stats
    const totalHours = sumHours(periodEntries);
    const totalEarnings = sumEarnings(periodEntries);
    const uniqueDays = new Set(periodEntries.map((e) => e.date)).size;
    const avgHoursDay = uniqueDays > 0 ? totalHours / uniqueDays : 0;

    setStats({ totalHours, totalEarnings, daysWorked: uniqueDays, avgHoursDay });

    // Breakdown
    const unpaid = periodEntries.filter((e) => e.status === 'unpaid' && e.billable).reduce((s, e) => s + e.earnings, 0);
    const invoiced = periodEntries.filter((e) => e.status === 'invoiced' && e.billable).reduce((s, e) => s + e.earnings, 0);
    const paid = periodEntries.filter((e) => (e.status === 'paid_cash' || e.status === 'paid_invoice') && e.billable).reduce((s, e) => s + e.earnings, 0);
    setBreakdown({ unpaid, invoiced, paid });

    // Chart data
    const grouped = groupEntriesByDate(periodEntries);
    let cd = [];

    if (period === 'week') {
      const { start: s, end: e } = getDateRange('week');
      const days = eachDayOfInterval({ start: parseISO(s), end: parseISO(e) });
      cd = days.map((d) => {
        const ds = format(d, 'yyyy-MM-dd');
        const dayEntries = grouped[ds] || [];
        return {
          label: format(d, 'EEE'),
          hours: Math.round(sumHours(dayEntries) * 100) / 100,
          earnings: sumEarnings(dayEntries),
          date: format(d, 'd MMM'),
        };
      });
    } else if (period === 'month') {
      const now = new Date();
      const s = startOfMonth(now);
      const e = endOfMonth(now);
      const weeks = eachWeekOfInterval({ start: s, end: e }, { weekStartsOn: 1 });
      cd = weeks.map((wkStart, i) => {
        const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
        const wkEntries = periodEntries.filter((entry) => {
          const d = parseISO(entry.date);
          return d >= wkStart && d <= wkEnd;
        });
        return {
          label: `Wk${i + 1}`,
          hours: Math.round(sumHours(wkEntries) * 100) / 100,
          earnings: sumEarnings(wkEntries),
          date: `${format(wkStart, 'd MMM')} – ${format(wkEnd, 'd MMM')}`,
        };
      });
    } else {
      // year — by month
      for (let m = 0; m < 12; m++) {
        const mStart = format(new Date(new Date().getFullYear(), m, 1), 'yyyy-MM');
        const mEntries = periodEntries.filter((e) => e.date.slice(0, 7) === mStart);
        cd.push({
          label: format(new Date(new Date().getFullYear(), m, 1), 'MMM'),
          hours: Math.round(sumHours(mEntries) * 100) / 100,
          earnings: sumEarnings(mEntries),
          date: format(new Date(new Date().getFullYear(), m, 1), 'MMMM yyyy'),
        });
      }
    }
    setChartData(cd);

    // Work patterns
    const dayOfWeekHours = [0, 0, 0, 0, 0, 0, 0]; // Mon–Sun
    const dayOfWeekCount = [0, 0, 0, 0, 0, 0, 0];
    let longestSession = 0;

    for (const entry of all) {
      const dow = (parseISO(entry.date).getDay() + 6) % 7; // Mon=0
      dayOfWeekHours[dow] += entry.workingHours || 0;
      dayOfWeekCount[dow]++;
      if (entry.workingHours > longestSession) longestSession = entry.workingHours;
    }

    const avgByDay = dayOfWeekHours.map((h, i) => (dayOfWeekCount[i] > 0 ? h / dayOfWeekCount[i] : 0));
    const bestDowIdx = avgByDay.indexOf(Math.max(...avgByDay));
    const DOW_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    // Streak
    const allDates = [...new Set(all.map((e) => e.date))].sort();
    let streak = 0;
    if (allDates.length > 0) {
      let current = new Date();
      let count = 0;
      for (let i = 0; i < 60; i++) {
        const ds = format(addDays(current, -i), 'yyyy-MM-dd');
        if (allDates.includes(ds)) {
          count++;
        } else if (count > 0) {
          break;
        }
      }
      streak = count;
    }

    setPatterns({
      bestDay: avgByDay.some((v) => v > 0) ? DOW_NAMES[bestDowIdx] : 'N/A',
      longestSession,
      streak,
    });
  }, [period, refreshKey]);

  useEffect(() => { loadData(); }, [loadData]);

  const total = breakdown.unpaid + breakdown.invoiced + breakdown.paid;
  const unpaidPct = total > 0 ? (breakdown.unpaid / total) * 100 : 0;
  const invoicedPct = total > 0 ? (breakdown.invoiced / total) * 100 : 0;
  const paidPct = total > 0 ? (breakdown.paid / total) * 100 : 0;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs">
        <p className="text-slate-300 font-medium mb-1">{d?.date}</p>
        <p className="font-mono text-amber-400">{decimalToHHMM(d?.hours || 0)} hrs</p>
        <p className="font-mono text-slate-300">{formatCurrency(d?.earnings || 0)}</p>
      </div>
    );
  };

  return (
    <div className="h-full scroll-area px-4 py-3 space-y-4">
      {/* Period tabs */}
      <div className="segmented">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={period === p ? 'active' : ''}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Hours" value={decimalToHHMM(stats.totalHours)} mono />
        <StatCard label="Total Earnings" value={formatCurrency(stats.totalEarnings)} mono accent />
        <StatCard label="Days Worked" value={`${stats.daysWorked} days`} />
        <StatCard label="Avg Hours/Day" value={`${stats.avgHoursDay.toFixed(1)} hrs`} />
      </div>

      {/* Earnings breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Earnings Breakdown</p>
        {total > 0 ? (
          <>
            <div className="flex rounded-full overflow-hidden h-4 gap-0.5 mb-3">
              {unpaidPct > 0 && (
                <div className="bg-slate-600 transition-all" style={{ width: `${unpaidPct}%` }} />
              )}
              {invoicedPct > 0 && (
                <div className="bg-blue-400 transition-all" style={{ width: `${invoicedPct}%` }} />
              )}
              {paidPct > 0 && (
                <div className="bg-emerald-400 transition-all" style={{ width: `${paidPct}%` }} />
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Unpaid', value: breakdown.unpaid, color: 'text-slate-400' },
                { label: 'Invoiced', value: breakdown.invoiced, color: 'text-blue-400' },
                { label: 'Paid', value: breakdown.paid, color: 'text-emerald-400' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className={`font-mono text-sm font-semibold ${color}`}>{formatCurrency(value)}</p>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-center text-slate-600 text-sm py-2">No earnings this {period}</p>
        )}
      </div>

      {/* Hours chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-4">Hours Worked</p>
        {chartData.some((d) => d.hours > 0) ? (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(245,158,11,0.08)' }} />
                <Bar dataKey="hours" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-center text-slate-600 text-sm py-8">No hours this {period}</p>
        )}
      </div>

      {/* Work patterns */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <p className="text-xs text-slate-500 uppercase tracking-widest">Work Patterns</p>
        <PatternRow label="Best Day of Week" value={patterns.bestDay} />
        <PatternRow label="Longest Session" value={decimalToHHMM(patterns.longestSession)} />
        <PatternRow label="Current Streak" value={`${patterns.streak} day${patterns.streak !== 1 ? 's' : ''}`} />
      </div>

      <div className="h-4" />
    </div>
  );
}

function StatCard({ label, value, mono, accent }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-semibold ${mono ? 'font-mono' : ''} ${accent ? 'text-amber-400' : 'text-slate-50'}`}>
        {value}
      </p>
    </div>
  );
}

function PatternRow({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="font-mono text-sm font-medium text-slate-200">{value}</span>
    </div>
  );
}
