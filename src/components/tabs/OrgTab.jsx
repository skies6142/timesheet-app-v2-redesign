import { useState, useEffect, useCallback, useMemo } from 'react';
import { Building2, Share2, Copy, Check, X, Plus, Users, ChevronLeft, ChevronRight, Download, SlidersHorizontal, Search } from 'lucide-react';
import { format, parseISO, addMonths, subMonths } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import * as orgApi from '../../lib/orgApi';
import { supabase } from '../../lib/supabase';
import { downloadInvoicePDF } from '../../lib/pdf';
import { getDaysInMonth, formatCurrency } from '../../lib/utils';
import AuthModal from '../modals/AuthModal';
import JobModal from '../modals/JobModal';
import SubmitInvoiceModal from '../modals/SubmitInvoiceModal';
import BottomSheet from '../ui/BottomSheet';

const STATUS_COLORS = {
  scheduled:   { dot: 'bg-amber-400',   badge: 'bg-amber-400/15 text-amber-400'   },
  in_progress: { dot: 'bg-blue-400',    badge: 'bg-blue-400/15 text-blue-400'     },
  completed:   { dot: 'bg-emerald-400', badge: 'bg-emerald-400/15 text-emerald-400' },
  cancelled:   { dot: 'bg-zinc-600',    badge: 'bg-zinc-800 text-zinc-500'         },
};

// ── Main tab ─────────────────────────────────────────────────
export default function OrgTab() {
  const { user, loading: authLoading } = useAuth();
  const { addToast } = useApp();

  const [orgData, setOrgData]       = useState(null); // { org, role, members }
  const [loading, setLoading]       = useState(true);
  const [activeView, setActiveView] = useState('calendar');

  // Auth modal
  const [showAuth, setShowAuth]   = useState(false);
  const [authMode, setAuthMode]   = useState('login');

  // Create org
  const [createName, setCreateName]     = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Join org
  const [joinCode, setJoinCode]     = useState('');
  const [joinRole, setJoinRole]     = useState('employee');
  const [joinLoading, setJoinLoading] = useState(false);

  // Job modal
  const [showJobModal, setShowJobModal]   = useState(false);
  const [selectedJob, setSelectedJob]     = useState(null);
  const [jobModalDate, setJobModalDate]   = useState(null);
  const [calRefreshKey, setCalRefreshKey] = useState(0);

  // Invoice modal
  const [showSubmitInvoice, setShowSubmitInvoice] = useState(false);

  const loadOrg = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await orgApi.getMyOrg();
      if (result?.org) {
        let members = [];
        try {
          members = await orgApi.getOrgMembers(result.org.id);
        } catch (membersErr) {
          addToast(`Members DB error: ${membersErr.message}`, 'error');
        }
        setOrgData({ ...result, members });
      } else {
        setOrgData(null);
      }
    } catch (e) {
      console.error('[OrgTab] loadOrg error:', e);
      setOrgData(null);
    } finally {
      setLoading(false);
    }
  }, [user, addToast]);

  useEffect(() => { loadOrg(); }, [loadOrg]);

  // Realtime: notify admin on new invoices, notify workers on new assignments
  useEffect(() => {
    if (!orgData?.org?.id || !user) return;
    const isOwner = orgData.role === 'owner';
    let channel;
    if (isOwner) {
      channel = supabase
        .channel(`org-invoices-${orgData.org.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoice_submissions', filter: `org_id=eq.${orgData.org.id}` },
          (payload) => { addToast(`New invoice from ${payload.new?.display_name || 'a worker'}`, 'info'); })
        .subscribe();
    } else {
      channel = supabase
        .channel(`user-assignments-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_assignments', filter: `user_id=eq.${user.id}` },
          () => { addToast('You have been assigned to a new job!', 'success'); setCalRefreshKey(k => k + 1); })
        .subscribe();
    }
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [orgData?.org?.id, orgData?.role, user?.id, addToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?join=CODE URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code) {
      setJoinCode(code.toUpperCase().slice(0, 6));
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleCreateOrg = async () => {
    if (!createName.trim()) return;
    setCreateLoading(true);
    try {
      await orgApi.createOrg(createName.trim());
      await loadOrg();
      addToast('Organisation created!', 'success');
    } catch (e) {
      addToast(e.message || 'Failed to create organisation', 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinOrg = async () => {
    if (joinCode.length !== 6) return;
    setJoinLoading(true);
    try {
      const org = await orgApi.getOrgByInviteCode(joinCode);
      await orgApi.joinOrg(org.id, joinRole);
      await loadOrg();
      addToast(`Joined ${org.name}!`, 'success');
    } catch (e) {
      addToast(e.message || 'Invalid invite code', 'error');
    } finally {
      setJoinLoading(false);
    }
  };

  const openJob = useCallback((job, date) => {
    setSelectedJob(job || null);
    setJobModalDate(date || null);
    setShowJobModal(true);
  }, []);

  const closeJobModal = () => {
    setShowJobModal(false);
    setSelectedJob(null);
    setJobModalDate(null);
  };

  const handleJobSaved = useCallback(() => {
    closeJobModal();
    setCalRefreshKey(k => k + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // key={`cal-${calRefreshKey}`} on OrgCalendarView forces a clean remount after save

  // ── Loading ────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Not signed in ──────────────────────────────────────────
  if (!user) {
    return (
      <>
        <div className="h-full flex flex-col items-center justify-center px-6 gap-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
            <Building2 size={28} className="text-amber-400" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-zinc-50 mb-2">Team & Organisation</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Create or join an organisation to share your work calendar, delegate jobs, and manage invoices with your team.
            </p>
          </div>
          <div className="w-full space-y-3">
            <button
              onClick={() => { setAuthMode('login'); setShowAuth(true); }}
              className="w-full bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold rounded-2xl py-4"
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
              className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold rounded-2xl py-4"
            >
              Create Account
            </button>
          </div>
        </div>
        <AuthModal
          isOpen={showAuth}
          initialMode={authMode}
          onClose={() => setShowAuth(false)}
          onSuccess={() => { setShowAuth(false); loadOrg(); }}
        />
      </>
    );
  }

  // ── No organisation ────────────────────────────────────────
  if (!orgData) {
    return (
      <div className="scroll-area h-full px-4 py-6 space-y-4">
        <div className="text-center mb-1">
          <h2 className="text-lg font-bold text-zinc-50">No Organisation Yet</h2>
          <p className="text-sm text-zinc-500 mt-1">Start your own or join an existing one</p>
        </div>

        {/* Create org */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Start an Organisation</p>
          <input
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateOrg()}
            placeholder="Organisation name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
          />
          <button
            onClick={handleCreateOrg}
            disabled={!createName.trim() || createLoading}
            className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-zinc-950 font-bold rounded-xl py-3"
          >
            {createLoading ? 'Creating…' : 'Create Organisation'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-xs text-zinc-600">or</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        {/* Join org */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Join an Organisation</p>
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="6-digit invite code"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50 font-mono tracking-[0.25em] uppercase"
            maxLength={6}
          />
          <div className="flex gap-2">
            <select
              value={joinRole}
              onChange={e => setJoinRole(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm text-zinc-100 focus:outline-none focus:border-amber-400/50"
            >
              <option value="employee">Employee</option>
              <option value="subcontractor">Subcontractor</option>
            </select>
            <button
              onClick={handleJoinOrg}
              disabled={joinCode.length !== 6 || joinLoading}
              className="flex-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-100 font-semibold rounded-xl py-3"
            >
              {joinLoading ? 'Joining…' : 'Join'}
            </button>
          </div>
        </div>

        <div className="h-4" />
      </div>
    );
  }

  // ── In an organisation ─────────────────────────────────────
  const isOwner = orgData.role === 'owner';
  const views = isOwner
    ? [{ id: 'calendar', label: 'Calendar' }, { id: 'members', label: 'Team' }, { id: 'invoices', label: 'Invoices' }, { id: 'reports', label: 'Reports' }]
    : [{ id: 'calendar', label: 'Calendar' }, { id: 'invoices', label: 'My Invoices' }];

  return (
    <div className="h-full flex flex-col">
      {/* Org header */}
      <OrgHeader org={orgData.org} role={orgData.role} memberCount={orgData.members.length} addToast={addToast} />

      {/* View tabs */}
      <div className="px-4 py-2 border-b border-zinc-800 shrink-0">
        <div className="segmented">
          {views.map(v => (
            <button key={v.id} onClick={() => setActiveView(v.id)} className={activeView === v.id ? 'active' : ''}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeView === 'calendar' && (
          <OrgCalendarView
            key={`cal-${calRefreshKey}`}
            orgId={orgData.org.id}
            isOwner={isOwner}
            members={orgData.members}
            onOpenJob={openJob}
          />
        )}
        {activeView === 'members' && isOwner && (
          <MembersView org={orgData.org} members={orgData.members} onRefresh={loadOrg} addToast={addToast} />
        )}
        {activeView === 'invoices' && (
          <InvoicesView
            orgId={orgData.org.id}
            isOwner={isOwner}
            onSubmit={() => setShowSubmitInvoice(true)}
            addToast={addToast}
          />
        )}
        {activeView === 'reports' && isOwner && (
          <HoursReportView orgId={orgData.org.id} addToast={addToast} />
        )}
      </div>

      {/* Job modal */}
      <JobModal
        isOpen={showJobModal}
        job={selectedJob}
        defaultDate={jobModalDate}
        orgId={orgData.org.id}
        members={orgData.members}
        isOwner={isOwner}
        onClose={closeJobModal}
        onSaved={handleJobSaved}
      />

      {/* Submit invoice modal */}
      <SubmitInvoiceModal
        isOpen={showSubmitInvoice}
        orgId={orgData.org.id}
        onClose={() => setShowSubmitInvoice(false)}
        onSubmitted={() => {
          setShowSubmitInvoice(false);
          addToast('Invoice submitted!', 'success');
          setActiveView('invoices');
        }}
      />
    </div>
  );
}

// ── Org header ────────────────────────────────────────────────
function OrgHeader({ org, role, memberCount, addToast }) {
  const [copied, setCopied] = useState(false);
  const inviteLink = `${window.location.origin}?join=${org.invite_code}`;

  const share = async () => {
    const shareData = { title: `Join ${org.name} on TimeSheet`, url: inviteLink };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast('Invite link copied!', 'success');
    }
  };

  return (
    <div className="px-4 pt-3 pb-2 border-b border-zinc-800 shrink-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-zinc-50">{org.name}</p>
          <p className="text-xs text-zinc-500 capitalize">{role} · {memberCount} member{memberCount !== 1 ? 's' : ''}</p>
        </div>
        {role === 'owner' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5">
              <span className="font-mono text-xs font-bold text-zinc-200 tracking-[0.25em]">{org.invite_code}</span>
            </div>
            <button
              onClick={share}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-amber-400/30"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Share2 size={16} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Org calendar view ─────────────────────────────────────────
function OrgCalendarView({ orgId, isOwner, members, onOpenJob }) {
  const { addToast } = useApp();
  const { user } = useAuth();
  const [viewDate, setViewDate]   = useState(new Date());
  const [jobMap, setJobMap]       = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [showDaySheet, setShowDaySheet] = useState(false);
  const [calLoading, setCalLoading] = useState(false);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1;
  const days  = getDaysInMonth(year, viewDate.getMonth());
  const today = format(new Date(), 'yyyy-MM-dd');

  const loadJobs = useCallback(async () => {
    setCalLoading(true);
    try {
      const jobs = await orgApi.getJobsForMonth(orgId, year, month);
      const map = {};
      for (const job of jobs) {
        if (!map[job.date]) map[job.date] = [];
        map[job.date].push(job);
      }
      setJobMap(map);
    } catch (e) {
      console.error('[loadJobs]', e);
      addToast(`Calendar error: ${e.message}`, 'error');
    } finally {
      setCalLoading(false);
    }
  }, [orgId, year, month, addToast]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const openDay = (date) => {
    setSelectedDate(date);
    setShowDaySheet(true);
  };

  const selectedDayJobs = selectedDate ? (jobMap[selectedDate] || []) : [];

  // Build rows (7-day weeks)
  const rows = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

  return (
    <div className="h-full flex flex-col">
      {/* Month nav */}
      <div className="shrink-0 px-4 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setViewDate(d => subMonths(d, 1))}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 text-xl min-h-[44px]"
          >
            ‹
          </button>
          <p className="font-semibold text-zinc-50">{format(viewDate, 'MMMM yyyy')}</p>
          <button
            onClick={() => setViewDate(d => addMonths(d, 1))}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 text-xl min-h-[44px]"
          >
            ›
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 scroll-area px-2 pb-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="text-center text-[10px] text-zinc-600 uppercase tracking-widest py-1">{d}</div>
          ))}
        </div>

        {calLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : (
          rows.map((row, rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-7 mb-1">
              {row.map((date, cellIdx) => {
                if (!date) return <div key={cellIdx} className="aspect-square" />;
                const dayJobs = jobMap[date] || [];
                const isToday = date === today;
                const dayNum  = parseInt(date.slice(8), 10);
                const isAssigned = user && dayJobs.some(j =>
                  j.job_assignments?.some(a => a.user_id === user.id)
                );

                return (
                  <button
                    key={date}
                    onClick={() => openDay(date)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-start p-1 transition-colors min-h-[44px] ${
                      isToday
                        ? 'border border-amber-400'
                        : isAssigned
                          ? 'border border-blue-400/60'
                          : 'border border-transparent'
                    } ${
                      isAssigned
                        ? 'bg-blue-400/10 hover:bg-blue-400/15'
                        : dayJobs.length > 0
                          ? 'bg-zinc-900 hover:bg-zinc-800'
                          : 'hover:bg-zinc-900/40'
                    }`}
                  >
                    <span className={`text-xs font-medium ${
                      isToday ? 'text-amber-400' : isAssigned ? 'text-blue-300' : 'text-zinc-300'
                    }`}>{dayNum}</span>
                    {dayJobs.length > 0 && (
                      <>
                        {isAssigned && (
                          <span className="text-[8px] text-blue-400 font-bold leading-tight">YOU</span>
                        )}
                        <div className="flex gap-0.5 mt-auto flex-wrap justify-center">
                          {dayJobs.slice(0, 3).map(j => (
                            <span key={j.id} className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[j.status]?.dot || 'bg-zinc-600'}`} />
                          ))}
                          {dayJobs.length > 3 && (
                            <span className="text-[8px] text-zinc-600 leading-tight">+{dayJobs.length - 3}</span>
                          )}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
        <div className="h-4" />
      </div>

      {/* Day jobs sheet */}
      <BottomSheet
        isOpen={showDaySheet}
        onClose={() => setShowDaySheet(false)}
        title={selectedDate ? format(parseISO(selectedDate), 'EEEE d MMMM') : ''}
      >
        <div className="px-4 py-3 space-y-2">
          {selectedDayJobs.length === 0 ? (
            <p className="text-center text-zinc-500 py-6 text-sm">No jobs scheduled for this day</p>
          ) : (
            selectedDayJobs.map(job => {
              const sc = STATUS_COLORS[job.status] || STATUS_COLORS.scheduled;
              return (
                <button
                  key={job.id}
                  onClick={() => { setShowDaySheet(false); onOpenJob(job, selectedDate); }}
                  className="w-full text-left bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 hover:border-zinc-600 active:bg-zinc-700/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sc.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">{job.title}</p>
                      {job.location && (
                        <p className="text-xs text-zinc-500 mt-0.5">📍 {job.location}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${sc.badge} capitalize`}>
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                </button>
              );
            })
          )}

          {isOwner && (
            <button
              onClick={() => { setShowDaySheet(false); onOpenJob(null, selectedDate); }}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-zinc-700 hover:border-amber-400/40 text-zinc-500 hover:text-amber-400 rounded-xl py-3 min-h-[48px] text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              Add job for {selectedDate ? format(parseISO(selectedDate), 'd MMM') : 'this day'}
            </button>
          )}
          <div className="h-2" />
        </div>
      </BottomSheet>
    </div>
  );
}

// ── Members view ──────────────────────────────────────────────
function MembersView({ org, members, onRefresh, addToast }) {
  const [copied, setCopied] = useState(false);
  const inviteLink = `${window.location.origin}?join=${org.invite_code}`;

  const share = async () => {
    const shareData = { title: `Join ${org.name} on TimeSheet`, url: inviteLink };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch {}
    }
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast('Invite link copied!', 'success');
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(org.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast('Invite code copied!', 'success');
  };

  const handleRemove = async (userId, name) => {
    if (!confirm(`Remove ${name} from ${org.name}?`)) return;
    try {
      await orgApi.removeMember(org.id, userId);
      addToast(`${name} removed`, 'success');
      onRefresh();
    } catch (e) {
      addToast('Failed to remove member', 'error');
    }
  };

  const ROLE_BADGE = {
    owner:          'bg-amber-400/15 text-amber-400',
    employee:       'bg-zinc-800 text-zinc-400',
    subcontractor:  'bg-blue-400/15 text-blue-400',
  };

  return (
    <div className="scroll-area h-full px-4 py-4 space-y-4">
      {/* Invite card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Invite to Organisation</p>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="font-mono text-xl font-bold text-zinc-50 tracking-[0.3em]">{org.invite_code}</span>
          <button onClick={copyCode} className="text-zinc-500 hover:text-zinc-300 p-1">
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>
        </div>
        <button
          onClick={share}
          className="w-full flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold rounded-xl py-3"
        >
          <Share2 size={16} />
          Share Invite Link
        </button>
        <p className="text-[11px] text-zinc-600 text-center">
          Share the code or link — new members choose their role when joining
        </p>
      </div>

      {/* Members list */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            {members.length} Member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {members.map(m => {
          const name = m.profiles?.display_name || m.display_name || m.profiles?.email || 'Unknown';
          const email = m.profiles?.email || '';
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 last:border-0">
              <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-zinc-400">{name[0]?.toUpperCase() || '?'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{name}</p>
                {email && <p className="text-xs text-zinc-500 truncate">{email}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_BADGE[m.role] || 'bg-zinc-800 text-zinc-400'}`}>
                  {m.role}
                </span>
                {m.role !== 'owner' && (
                  <button
                    onClick={() => handleRemove(m.user_id, name)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="h-4" />
    </div>
  );
}

// ── Invoices view (owner + worker) ────────────────────────────
function InvoicesView({ orgId, isOwner, onSubmit, addToast }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [updatingId, setUpdatingId]   = useState(null);
  const [detailSub, setDetailSub]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = isOwner
        ? await orgApi.getOrgSubmissions(orgId)
        : await orgApi.getMySubmissions(orgId);
      setSubmissions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [orgId, isOwner]);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (id, status) => {
    setUpdatingId(id);
    try {
      await orgApi.updateSubmissionStatus(id, status);
      await load();
      if (detailSub?.id === id) setDetailSub(s => ({ ...s, status }));
      addToast(`Marked as ${status}`, 'success');
    } catch (e) {
      addToast('Failed to update', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const STATUS_STYLE = {
    pending:  'bg-amber-400/15 text-amber-400',
    approved: 'bg-blue-400/15 text-blue-400',
    paid:     'bg-emerald-400/15 text-emerald-400',
    rejected: 'bg-red-400/15 text-red-400',
  };

  return (
    <>
      <div className="scroll-area h-full px-4 py-4 space-y-3">
        {!isOwner && (
          <button
            onClick={onSubmit}
            className="w-full flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold rounded-2xl py-4"
          >
            <Plus size={18} />
            Submit Invoice to Organisation
          </button>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-zinc-500 text-sm">No invoices yet</p>
            {!isOwner && <p className="text-zinc-600 text-xs mt-1">Submit your time to get paid</p>}
          </div>
        ) : (
          submissions.map(s => {
            const inv = s.invoice_data || {};
            const total = inv.total || 0;
            return (
              <button
                key={s.id}
                onClick={() => setDetailSub(s)}
                className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-600 transition-colors active:bg-zinc-800/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 mr-3">
                    {isOwner && (
                      <p className="text-xs font-semibold text-amber-400 mb-0.5">{s.display_name}</p>
                    )}
                    <p className="font-semibold text-zinc-100 text-sm">
                      {inv.invoiceNumber ? `${inv.invoiceNumber} · ` : ''}{inv.description || 'Invoice'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {format(parseISO(s.submitted_at), 'd MMM yyyy')}
                      {inv.periodFrom && inv.periodTo && ` · ${format(parseISO(inv.periodFrom), 'd MMM')} – ${format(parseISO(inv.periodTo), 'd MMM')}`}
                    </p>
                    {inv.hours > 0 && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {decimalToHHMM(inv.hours)} hrs · {inv.entries?.length || 0} {inv.entries?.length !== 1 ? 'entries' : 'entry'}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-xl font-bold text-amber-400">{formatCurrency(total)}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[s.status] || 'bg-zinc-800 text-zinc-400'} capitalize`}>
                      {s.status}
                    </span>
                  </div>
                </div>
                {isOwner && (
                  <p className="text-[10px] text-zinc-600 mt-2">Tap to view full invoice</p>
                )}
              </button>
            );
          })
        )}
        <div className="h-4" />
      </div>

      {/* Full invoice detail sheet */}
      {detailSub && (
        <InvoiceDetailSheet
          submission={detailSub}
          isOwner={isOwner}
          updatingId={updatingId}
          onStatus={handleStatus}
          onClose={() => setDetailSub(null)}
          statusStyle={STATUS_STYLE}
        />
      )}
    </>
  );
}

function decimalToHHMM(decimal) {
  if (!decimal || isNaN(decimal)) return '0:00';
  const totalMins = Math.round(decimal * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function buildSubmissionPdfObjects(submission) {
  const inv = submission.invoice_data || {};
  const pdfSettings = {
    businessName: inv.businessName || submission.display_name || '',
    abn: inv.abn || '',
    address: '',
    suburb: '',
    state: '',
    postcode: '',
    bankName: inv.bankName || '',
    bsb: inv.bsb || '',
    accountNumber: inv.accountNumber || '',
    paymentTermsDays: 14,
    gstRegistered: inv.gstRegistered || false,
    paymentNotes: inv.notes || '',
  };
  const submittedDate = submission.submitted_at
    ? new Date(submission.submitted_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const pdfInvoice = {
    invoiceNumber: inv.invoiceNumber || 'INV',
    date: inv.periodTo || submittedDate,
    subtotal: Number(inv.subtotal) || Number(inv.total) || 0,
    gstAmount: Number(inv.gst) || 0,
    total: Number(inv.total) || 0,
    entries: (inv.entries || []).map(e => ({
      date: e.date,
      description: e.description || 'Labour',
      workingHours: Number(e.workingHours) || 0,
      hourlyRate: Number(e.hourlyRate) || 0,
      earnings: Number(e.earnings) || 0,
    })),
  };
  return { invoice: pdfInvoice, settings: pdfSettings };
}

function InvoiceDetailSheet({ submission, isOwner, updatingId, onStatus, onClose, statusStyle }) {
  const inv     = submission?.invoice_data || {};
  const total    = Number(inv.total)    || 0;
  const subtotal = Number(inv.subtotal) || total;
  const gst      = Number(inv.gst)      || 0;

  const safeDate = (str, fmt) => {
    if (!str) return '';
    try { return format(new Date(str), fmt); } catch { return str; }
  };

  const abn = inv.abn || '';
  const fmtAbn = abn.replace(/\D/g, '');
  const displayAbn = fmtAbn.length === 11
    ? `${fmtAbn.slice(0,2)} ${fmtAbn.slice(2,5)} ${fmtAbn.slice(5,8)} ${fmtAbn.slice(8,11)}`
    : abn;

  return (
    <div className="fixed inset-0 z-[55] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-zinc-900 rounded-t-2xl flex flex-col"
        style={{ maxHeight: '95vh', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <div>
            <p className="text-base font-bold text-zinc-50">
              {inv.invoiceNumber || 'Invoice'}
            </p>
            <p className="text-xs text-zinc-500">
              {safeDate(submission.submitted_at, 'd MMM yyyy')}
              {submission.display_name && ` · ${submission.display_name}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${statusStyle[submission.status] || 'bg-zinc-800 text-zinc-400'}`}>
              {submission.status}
            </span>
            <button
              onClick={() => {
                const { invoice, settings: ps } = buildSubmissionPdfObjects(submission);
                downloadInvoicePDF(invoice, ps);
              }}
              title="Download PDF"
              className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-amber-400 transition-colors"
            >
              <Download size={18} />
            </button>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 scroll-area overflow-y-auto px-5 py-4 space-y-4">

          {/* Business info */}
          {(inv.businessName || abn) && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">From</p>
              {inv.businessName && <p className="text-sm font-bold text-zinc-50">{inv.businessName}</p>}
              {displayAbn && <p className="text-xs text-zinc-400 mt-0.5">ABN: {displayAbn}</p>}
            </div>
          )}

          {/* Invoice summary */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl divide-y divide-zinc-700/60">
            {inv.description && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Description</span>
                <span className="text-sm font-medium text-zinc-200 max-w-[60%] text-right">{inv.description}</span>
              </div>
            )}
            {inv.periodFrom && inv.periodTo && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Period</span>
                <span className="text-sm font-medium text-zinc-200">
                  {safeDate(inv.periodFrom, 'd MMM')} – {safeDate(inv.periodTo, 'd MMM yyyy')}
                </span>
              </div>
            )}
            {Number(inv.hours) > 0 && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Total hours</span>
                <span className="text-sm font-mono text-zinc-200">{decimalToHHMM(Number(inv.hours))}</span>
              </div>
            )}
            {inv.entries?.length > 0 && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Entries</span>
                <span className="text-sm font-medium text-zinc-200">{inv.entries.length}</span>
              </div>
            )}
            {gst > 0 && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Subtotal</span>
                <span className="text-sm font-mono text-zinc-200">{formatCurrency(subtotal)}</span>
              </div>
            )}
            {gst > 0 && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">GST (10%)</span>
                <span className="text-sm font-mono text-zinc-200">{formatCurrency(gst)}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm font-bold text-zinc-100">Total</span>
              <span className="text-xl font-mono font-bold text-amber-400">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Line items */}
          {inv.entries?.length > 0 && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl overflow-hidden">
              <p className="text-xs text-zinc-500 uppercase tracking-widest px-4 pt-3 pb-1">Time Entries</p>
              <div className="divide-y divide-zinc-700/50">
                {inv.entries.map((e, i) => (
                  <div key={i} className="px-4 py-3 flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">
                        {e.description || e.clientName || 'Labour'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                        {safeDate(e.date, 'EEE d MMM')}
                        {e.timeIn && e.timeOut ? ` · ${e.timeIn}–${e.timeOut}` : ''}
                        {e.hourlyRate ? ` · $${e.hourlyRate}/hr` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-semibold text-zinc-100">{formatCurrency(Number(e.earnings) || 0)}</p>
                      <p className="text-xs font-mono text-zinc-500">{decimalToHHMM(Number(e.workingHours))}h</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bank details */}
          {(inv.bankName || inv.bsb || inv.accountNumber) && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl divide-y divide-zinc-700/60">
              <p className="text-xs text-zinc-500 uppercase tracking-widest px-4 pt-3 pb-1">Payment Details</p>
              {inv.bankName && (
                <div className="flex justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Bank</span>
                  <span className="text-sm font-medium text-zinc-200">{inv.bankName}</span>
                </div>
              )}
              {inv.bsb && (
                <div className="flex justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">BSB</span>
                  <span className="text-sm font-mono text-zinc-200">{inv.bsb}</span>
                </div>
              )}
              {inv.accountNumber && (
                <div className="flex justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Account</span>
                  <span className="text-sm font-mono text-zinc-200">{inv.accountNumber}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {inv.notes && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Notes</p>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{inv.notes}</p>
            </div>
          )}

          {/* Status controls */}
          {isOwner && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-4 space-y-3">
              <p className="text-xs text-zinc-500 uppercase tracking-widest">Update Status</p>
              <div className="grid grid-cols-2 gap-2">
                {submission.status !== 'approved' && submission.status !== 'paid' && (
                  <button onClick={() => onStatus(submission.id, 'approved')}
                    disabled={updatingId === submission.id}
                    className="bg-blue-500/15 text-blue-400 border border-blue-500/25 rounded-xl py-3 text-sm font-semibold hover:bg-blue-500/25 disabled:opacity-50">
                    Approve
                  </button>
                )}
                {submission.status !== 'paid' && (
                  <button onClick={() => onStatus(submission.id, 'paid')}
                    disabled={updatingId === submission.id}
                    className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-xl py-3 text-sm font-semibold hover:bg-emerald-500/25 disabled:opacity-50">
                    Mark Paid
                  </button>
                )}
                {submission.status !== 'rejected' && (
                  <button onClick={() => onStatus(submission.id, 'rejected')}
                    disabled={updatingId === submission.id}
                    className="bg-red-500/10 text-red-400 border border-red-400/20 rounded-xl py-3 text-sm font-semibold hover:bg-red-500/15 disabled:opacity-50">
                    Reject
                  </button>
                )}
                {submission.status !== 'pending' && (
                  <button onClick={() => onStatus(submission.id, 'pending')}
                    disabled={updatingId === submission.id}
                    className="bg-zinc-700 text-zinc-400 border border-zinc-600 rounded-xl py-3 text-sm font-semibold hover:bg-zinc-600 disabled:opacity-50">
                    Reset Pending
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}

// ── Hours report (owner only) ─────────────────────────────────
function HoursReportView({ orgId, addToast }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filterWorker, setFilterWorker] = useState('all');
  const [searchJob, setSearchJob]     = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [groupBy, setGroupBy]         = useState('job');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await orgApi.getOrgSubmissions(orgId);
      setSubmissions(data);
    } catch (e) {
      addToast(`Failed to load: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [orgId, addToast]);

  useEffect(() => { load(); }, [load]);

  const allEntries = useMemo(() =>
    submissions.flatMap(s =>
      (s.invoice_data?.entries || []).map(e => ({
        ...e,
        workerName: s.display_name || 'Unknown',
        submissionStatus: s.status,
        invoiceNumber: s.invoice_data?.invoiceNumber,
      }))
    ), [submissions]);

  const workers = useMemo(() => {
    const names = [...new Set(submissions.map(s => s.display_name).filter(Boolean))];
    return names.sort();
  }, [submissions]);

  const filtered = useMemo(() => allEntries.filter(e => {
    if (filterWorker !== 'all' && e.workerName !== filterWorker) return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    if (searchJob) {
      const hay = `${e.clientName || ''} ${e.description || ''}`.toLowerCase();
      if (!hay.includes(searchJob.toLowerCase())) return false;
    }
    return true;
  }), [allEntries, filterWorker, dateFrom, dateTo, searchJob]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      const key = groupBy === 'job' ? (e.clientName || 'Unspecified') : e.workerName;
      if (!map.has(key)) map.set(key, { entries: [], totalHours: 0, totalEarnings: 0 });
      const g = map.get(key);
      g.entries.push(e);
      g.totalHours += Number(e.workingHours) || 0;
      g.totalEarnings += Number(e.earnings) || 0;
    }
    return [...map.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [filtered, groupBy]);

  const totalHours    = filtered.reduce((s, e) => s + (Number(e.workingHours) || 0), 0);
  const totalEarnings = filtered.reduce((s, e) => s + (Number(e.earnings) || 0), 0);
  const hasFilters    = filterWorker !== 'all' || searchJob || dateFrom || dateTo;

  return (
    <div className="h-full flex flex-col">
      {/* Filter controls */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-zinc-800 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              value={searchJob}
              onChange={e => setSearchJob(e.target.value)}
              placeholder="Search job, client, description…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50 min-h-[44px]"
            />
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`w-11 h-11 flex items-center justify-center rounded-xl border transition-colors ${hasFilters ? 'border-amber-400 text-amber-400' : 'border-zinc-700 text-zinc-400'}`}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
        {showFilters && (
          <div className="space-y-2">
            <select
              value={filterWorker}
              onChange={e => setFilterWorker(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-400/50 min-h-[44px]"
            >
              <option value="all">All workers</option>
              {workers.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-50 focus:outline-none focus:border-amber-400/50 min-h-[44px]" />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-50 focus:outline-none focus:border-amber-400/50 min-h-[44px]" />
            </div>
            {hasFilters && (
              <button
                onClick={() => { setFilterWorker('all'); setSearchJob(''); setDateFrom(''); setDateTo(''); }}
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
        <div className="segmented">
          <button onClick={() => setGroupBy('job')} className={groupBy === 'job' ? 'active' : ''}>By Job / Client</button>
          <button onClick={() => setGroupBy('worker')} className={groupBy === 'worker' ? 'active' : ''}>By Worker</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="shrink-0 mx-4 my-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 flex justify-between items-center">
        <div className="text-center">
          <p className="font-mono text-base font-semibold text-zinc-50">{decimalToHHMM(totalHours)}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Hours</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-base font-semibold text-amber-400">{formatCurrency(totalEarnings)}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Total Cost</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-base font-semibold text-zinc-50">{filtered.length}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Entries</p>
        </div>
      </div>

      {/* Grouped results */}
      <div className="flex-1 scroll-area px-4 pb-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-zinc-500 text-sm">No data matches your filters</p>
            {submissions.length === 0 && <p className="text-zinc-600 text-xs mt-1">No invoices have been submitted yet</p>}
          </div>
        ) : (
          grouped.map(group => (
            <ReportGroup key={group.name} group={group} groupBy={groupBy} />
          ))
        )}
        <div className="h-4" />
      </div>
    </div>
  );
}

function ReportGroup({ group, groupBy }) {
  const [expanded, setExpanded] = useState(false);

  const subGroups = useMemo(() => {
    const map = new Map();
    for (const e of group.entries) {
      const key = groupBy === 'job' ? e.workerName : (e.clientName || 'Unspecified');
      if (!map.has(key)) map.set(key, { name: key, hours: 0, earnings: 0, count: 0 });
      const g = map.get(key);
      g.hours += Number(e.workingHours) || 0;
      g.earnings += Number(e.earnings) || 0;
      g.count++;
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [group.entries, groupBy]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/50 active:bg-zinc-800 transition-colors"
      >
        <div className="flex-1 min-w-0 mr-3">
          <p className="font-semibold text-zinc-100 text-sm truncate">{group.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {subGroups.length} {groupBy === 'job' ? 'worker' : 'site'}{subGroups.length !== 1 ? 's' : ''}
            {' · '}{group.entries.length} {group.entries.length !== 1 ? 'entries' : 'entry'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-sm font-bold text-zinc-100">{decimalToHHMM(group.totalHours)}</p>
          <p className="font-mono text-xs text-amber-400">{formatCurrency(group.totalEarnings)}</p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
          {subGroups.map(sg => (
            <div key={sg.name} className="px-4 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-300">{sg.name}</p>
                <p className="text-xs text-zinc-600">{sg.count} {sg.count !== 1 ? 'entries' : 'entry'}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-medium text-zinc-200">{decimalToHHMM(sg.hours)}</p>
                <p className="font-mono text-xs text-zinc-500">{formatCurrency(sg.earnings)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
