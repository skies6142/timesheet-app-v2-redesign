import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Building2, Share2, Copy, Check, X, Plus, Users, ChevronLeft, ChevronRight, Download, SlidersHorizontal, Search, StickyNote, Pencil, Eye, Lock, MoreVertical, CalendarDays, LayoutList, GripVertical } from 'lucide-react';
import { format, parseISO, addMonths, subMonths } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import * as orgApi from '../../lib/orgApi';
import { supabase } from '../../lib/supabase';
import { downloadInvoicePDF } from '../../lib/pdf';
import { getDaysInMonth, formatCurrency } from '../../lib/utils';
import AuthModal from '../modals/AuthModal';
import JobModal, { JOB_COLORS } from '../modals/JobModal';
import SubmitInvoiceModal from '../modals/SubmitInvoiceModal';
import BottomSheet from '../ui/BottomSheet';

const jobColorHex = (colorId) =>
  JOB_COLORS.find(c => c.id === (colorId || 'amber'))?.hex || '#f59e0b';

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
  const [activeView, setActiveView] = useState(() => {
    try { return localStorage.getItem('orgActiveView') || 'calendar'; } catch { return 'calendar'; }
  });

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
  }, [orgData?.org?.id, orgData?.role, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    try { localStorage.setItem('orgActiveView', activeView); } catch {}
  }, [activeView]);

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
  const isOwner   = orgData.role === 'owner';
  const isAdmin   = orgData.role === 'admin';
  const canManage = isOwner || isAdmin; // admins have full owner-level access
  const views = canManage
    ? [{ id: 'calendar', label: 'Calendar' }, { id: 'members', label: 'Members' }, { id: 'notes', label: 'Notes' }, { id: 'invoices', label: 'Invoices' }, { id: 'reports', label: 'Reports' }]
    : [{ id: 'calendar', label: 'Calendar' }, { id: 'notes', label: 'Notes' }, { id: 'invoices', label: 'My Invoices' }];

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
            isAdmin={isAdmin}
            members={orgData.members}
            onOpenJob={openJob}
          />
        )}
        {activeView === 'members' && canManage && (
          <MembersView org={orgData.org} members={orgData.members} onRefresh={loadOrg} addToast={addToast} isOwner={canManage} />
        )}
        {activeView === 'invoices' && (
          <InvoicesView
            orgId={orgData.org.id}
            isOwner={canManage}
            onSubmit={() => setShowSubmitInvoice(true)}
            addToast={addToast}
          />
        )}
        {activeView === 'notes' && (
          <NotesView orgId={orgData.org.id} isOwner={isOwner} isAdmin={isAdmin} members={orgData.members} addToast={addToast} />
        )}
        {activeView === 'reports' && canManage && (
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
        isOwner={canManage}
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
    const shareData = { title: `Join ${org.name} on Docket`, url: inviteLink };
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
        {(role === 'owner' || role === 'admin') && (
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
function OrgCalendarView({ orgId, isOwner, isAdmin, members, onOpenJob }) {
  const { addToast } = useApp();
  const { user } = useAuth();
  const [viewDate, setViewDate]           = useState(new Date());
  const [jobMap, setJobMap]               = useState({});
  const [allJobs, setAllJobs]             = useState([]);
  const [selectedDate, setSelectedDate]   = useState(null);
  const [showDaySheet, setShowDaySheet]   = useState(false);
  const [calLoading, setCalLoading]       = useState(false);
  const [updatingJobId, setUpdatingJobId] = useState(null);
  const [checkInsMap, setCheckInsMap]     = useState({}); // { jobId: [sessions] }
  const [calView, setCalView] = useState(() => {
    try { return localStorage.getItem('orgCalView') || 'grid'; } catch { return 'grid'; }
  });
  const persistCalView = (v) => {
    setCalView(v);
    try { localStorage.setItem('orgCalView', v); } catch {}
  };
  const canSeeAll = isOwner || isAdmin;

  const swipeRef = useRef(null);
  const handleTouchStart = (e) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e) => {
    if (!swipeRef.current) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;
    swipeRef.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      setViewDate(d => dx > 0 ? subMonths(d, 1) : addMonths(d, 1));
    }
  };

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1;
  const days  = getDaysInMonth(year, viewDate.getMonth());
  const today = format(new Date(), 'yyyy-MM-dd');

  const loadJobs = useCallback(async () => {
    setCalLoading(true);
    try {
      const jobs = await orgApi.getJobsForMonth(orgId, year, month);
      // Workers only see jobs they're assigned to
      const visible = canSeeAll
        ? jobs
        : jobs.filter(j => j.job_assignments?.some(a => a.user_id === user?.id));
      const map = {};
      for (const job of visible) {
        if (!map[job.date]) map[job.date] = [];
        map[job.date].push(job);
      }
      setJobMap(map);
      setAllJobs(visible);

      // Load check-ins for all visible jobs in one query
      const jobIds = visible.map(j => j.id);
      const allCheckIns = await orgApi.getCheckInsForJobs(jobIds);
      const ciMap = {};
      for (const ci of allCheckIns) {
        if (!ciMap[ci.job_id]) ciMap[ci.job_id] = [];
        ciMap[ci.job_id].push(ci);
      }
      setCheckInsMap(ciMap);
    } catch (e) {
      console.error('[loadJobs]', e);
      addToast(`Calendar error: ${e.message}`, 'error');
    } finally {
      setCalLoading(false);
    }
  }, [orgId, year, month, addToast, canSeeAll, user?.id]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const openDay = (date) => {
    setSelectedDate(date);
    setShowDaySheet(true);
  };

  const handleQuickStatus = async (jobId, newStatus) => {
    setUpdatingJobId(jobId);
    try {
      await orgApi.updateJobStatus(jobId, newStatus);
      await loadJobs();
      addToast(`Job ${newStatus.replace('_', ' ')}`, 'success');
    } catch (e) {
      addToast(e.message || 'Failed to update', 'error');
    } finally {
      setUpdatingJobId(null);
    }
  };

  const selectedDayJobs = selectedDate ? (jobMap[selectedDate] || []) : [];

  // Worker presence for a job — returns array of { userId, name, initial, status: 'in'|'done'|'pending' }
  const workerPresence = (job) => {
    const sessions = checkInsMap[job.id] || [];
    return (job.job_assignments || []).map(a => {
      const m = members.find(mb => mb.user_id === a.user_id);
      const name = m?.display_name || m?.profiles?.display_name || '?';
      const userSessions = sessions.filter(ci => ci.user_id === a.user_id);
      const hasOpen = userSessions.some(ci => !ci.checked_out_at);
      const allDone = userSessions.length > 0 && userSessions.every(ci => ci.checked_out_at);
      return {
        userId: a.user_id,
        name,
        initial: (name[0] || '?').toUpperCase(),
        status: hasOpen ? 'in' : allDone ? 'done' : 'pending',
      };
    });
  };

  // Build rows (7-day weeks)
  const rows = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

  // Group jobs for list view: series → one card, singles → one card each
  const listItems = useMemo(() => {
    // Group key: prefer series_id, fall back to title+location match
    const groupMap = {};
    for (const job of allJobs) {
      const key = job.series_id
        ? `s:${job.series_id}`
        : `t:${(job.title || '').toLowerCase().trim()}::${(job.location || '').toLowerCase().trim()}`;
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(job);
    }
    const result = [];
    for (const [, jobs] of Object.entries(groupMap)) {
      const sorted = [...jobs].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 1) {
        result.push({ type: 'single', job: sorted[0], date: sorted[0].date });
      } else {
        result.push({
          type: 'series',
          jobs: sorted,
          series_id: sorted[0].series_id || null,
          firstDate: sorted[0].date,
          lastDate: sorted[sorted.length - 1].date,
          representativeJob: sorted[0],
        });
      }
    }
    return result.sort((a, b) => {
      const aDate = a.type === 'single' ? a.date : a.firstDate;
      const bDate = b.type === 'single' ? b.date : b.firstDate;
      return aDate.localeCompare(bDate);
    });
  }, [allJobs]);

  return (
    <div className="h-full flex flex-col" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Month nav + view toggle */}
      <div className="shrink-0 px-4 pt-3 pb-1">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setViewDate(d => subMonths(d, 1))}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 text-xl min-h-[44px]"
          >
            ‹
          </button>
          <p className="font-semibold text-zinc-50 flex-1 text-center">{format(viewDate, 'MMMM yyyy')}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewDate(d => addMonths(d, 1))}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 text-xl min-h-[44px]"
            >
              ›
            </button>
            {/* Calendar / List toggle */}
            <div className="flex rounded-xl overflow-hidden border border-zinc-700 ml-1">
              <button onClick={() => persistCalView('grid')}
                className={`w-9 h-9 flex items-center justify-center transition-colors ${calView === 'grid' ? 'bg-amber-400 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <CalendarDays size={15} />
              </button>
              <button onClick={() => persistCalView('list')}
                className={`w-9 h-9 flex items-center justify-center border-l border-zinc-700 transition-colors ${calView === 'list' ? 'bg-amber-400 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <LayoutList size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar grid OR list view */}
      <div className="flex-1 scroll-area px-2 pb-4 overflow-y-auto">
        {calLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : calView === 'list' ? (
          /* ── LIST VIEW ── */
          <div className="px-2 pt-2 space-y-2">
            {listItems.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-zinc-500 text-sm">No jobs this month</p>
              </div>
            ) : (
              listItems.map(item => {
                const isSeries = item.type === 'series';
                const job = isSeries ? item.representativeJob : item.job;
                const firstDate = isSeries ? item.firstDate : item.date;
                const sc = STATUS_COLORS[job.status] || STATUS_COLORS.scheduled;
                const isUpdating = updatingJobId === job.id;
                const assignedToMe = isSeries
                  ? item.jobs.some(j => j.job_assignments?.some(a => a.user_id === user?.id))
                  : job.job_assignments?.some(a => a.user_id === user?.id);
                const jobHex = jobColorHex(job.color);
                const isToday = firstDate === today;
                const containsToday = isSeries && item.firstDate <= today && item.lastDate >= today;
                const dateLabel = isSeries
                  ? `${format(parseISO(item.firstDate), 'd MMM')} → ${format(parseISO(item.lastDate), 'd MMM')} · ${item.jobs.length} day${item.jobs.length !== 1 ? 's' : ''}`
                  : format(parseISO(firstDate), 'EEE d MMM');
                return (
                  <div key={isSeries ? item.series_id : job.id}
                    className="bg-zinc-900 rounded-xl overflow-hidden flex border"
                    style={{
                      borderColor: job.status === 'completed' ? '#34d39940'
                        : assignedToMe ? jobHex + '50' : '#27272a',
                    }}
                  >
                    {/* Color stripe */}
                    <div className="w-1 shrink-0 rounded-l-xl" style={{ backgroundColor: jobHex }} />
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => onOpenJob(job, firstDate)}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-800/50 active:bg-zinc-800 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sc.dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-zinc-100 leading-snug">{job.title}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {dateLabel}
                              {(isToday || containsToday) && <span className="ml-1.5 font-semibold" style={{ color: jobHex }}>Today</span>}
                            </p>
                            {job.location && <p className="text-xs text-zinc-500 mt-0.5 truncate">📍 {job.location}</p>}
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${sc.badge} capitalize`}>
                            {job.status === 'completed' ? '✓ Done' : job.status.replace('_', ' ')}
                          </span>
                        </div>
                      </button>
                      {/* Worker presence row — visible to owner/admin on non-series in_progress jobs */}
                      {!isSeries && canSeeAll && job.status === 'in_progress' && (() => {
                        const presence = workerPresence(job);
                        if (!presence.length) return null;
                        const inCount      = presence.filter(p => p.status === 'in').length;
                        const doneCount    = presence.filter(p => p.status === 'done').length;
                        const pendingCount = presence.filter(p => p.status === 'pending').length;
                        return (
                          <div className="flex items-center gap-2 px-4 pb-2.5 pt-0">
                            <div className="flex items-center gap-1">
                              {presence.map(p => (
                                <div key={p.userId} title={`${p.name} — ${p.status === 'in' ? 'clocked in' : p.status === 'done' ? 'done' : 'not started'}`}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-colors ${
                                    p.status === 'in'      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                                    : p.status === 'done'  ? 'bg-blue-500/15 border-blue-500 text-blue-400'
                                    : 'bg-zinc-700 border-zinc-500 text-zinc-300'}`}>
                                  {p.initial}
                                </div>
                              ))}
                            </div>
                            <span className="text-[10px] text-zinc-500">
                              {inCount > 0 && <span className="text-emerald-400 font-semibold">{inCount} in</span>}
                              {inCount > 0 && (doneCount + pendingCount) > 0 && <span className="text-zinc-700"> · </span>}
                              {doneCount > 0 && <span className="text-blue-400 font-semibold">{doneCount} done</span>}
                              {doneCount > 0 && pendingCount > 0 && <span className="text-zinc-700"> · </span>}
                              {pendingCount > 0 && <span className="text-zinc-600">{pendingCount} pending</span>}
                            </span>
                          </div>
                        );
                      })()}

                      {!isSeries && (canSeeAll || assignedToMe) && (
                        <div className="flex gap-1.5 px-4 pb-3 border-t border-zinc-800/50 pt-2">
                          {job.status === 'scheduled' && (
                            <button onClick={() => handleQuickStatus(job.id, 'in_progress')} disabled={isUpdating}
                              className="flex-1 text-xs text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-lg py-2 font-semibold disabled:opacity-50">
                              {isUpdating ? '…' : 'Start'}
                            </button>
                          )}
                          {(job.status === 'scheduled' || job.status === 'in_progress') && (
                            <button onClick={() => handleQuickStatus(job.id, 'completed')} disabled={isUpdating}
                              className="flex-1 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg py-2 font-semibold disabled:opacity-50">
                              {isUpdating ? '…' : 'Complete'}
                            </button>
                          )}
                          {canSeeAll && job.status !== 'cancelled' && job.status !== 'completed' && (
                            <button onClick={() => handleQuickStatus(job.id, 'cancelled')} disabled={isUpdating}
                              className="flex-1 text-xs text-zinc-500 bg-zinc-700/50 border border-zinc-600 rounded-lg py-2 font-semibold disabled:opacity-50">
                              {isUpdating ? '…' : 'Cancel'}
                            </button>
                          )}
                          {canSeeAll && (job.status === 'cancelled' || job.status === 'completed') && (
                            <button onClick={() => handleQuickStatus(job.id, 'scheduled')} disabled={isUpdating}
                              className="flex-1 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg py-2 font-semibold disabled:opacity-50">
                              {isUpdating ? '…' : 'Reopen'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {canSeeAll && (
              <button
                onClick={() => onOpenJob(null, today)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-zinc-700 hover:border-amber-400/40 text-zinc-500 hover:text-amber-400 rounded-xl py-3 text-sm font-medium transition-colors mt-2"
              >
                <Plus size={16} />
                Add job
              </button>
            )}
            <div className="h-4" />
          </div>
        ) : (
          /* ── GRID VIEW ── */
          <>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="text-center text-[10px] text-zinc-600 uppercase tracking-widest py-1">{d}</div>
              ))}
            </div>
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-7 mb-1">
                {row.map((date, cellIdx) => {
                  if (!date) return <div key={cellIdx} className="aspect-square" />;
                  const dayJobs    = jobMap[date] || [];
                  const isToday    = date === today;
                  const dayNum     = parseInt(date.slice(8), 10);
                  const isAssigned = user && dayJobs.some(j =>
                    j.job_assignments?.some(a => a.user_id === user.id)
                  );
                  const myJob = isAssigned ? dayJobs.find(j => j.job_assignments?.some(a => a.user_id === user.id)) : null;
                  const myJobHex = myJob ? jobColorHex(myJob.color) : '#f59e0b';
                  return (
                    <button key={date} onClick={() => openDay(date)}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-start p-1 transition-colors min-h-[44px] ${
                        isAssigned ? 'hover:opacity-90'
                        : dayJobs.length > 0 ? 'bg-zinc-900 hover:bg-zinc-800'
                        : 'hover:bg-zinc-900/40'
                      }`}
                      style={{
                        border: isToday
                          ? '1px solid #71717a'
                          : isAssigned
                          ? `2px solid ${myJobHex}b3`
                          : '1px solid transparent',
                        backgroundColor: isAssigned ? `${myJobHex}26` : undefined,
                      }}
                    >
                      <span className={`text-xs font-medium ${isToday ? 'text-zinc-200 font-bold' : isAssigned ? 'text-zinc-100 font-semibold' : 'text-zinc-300'}`}>{dayNum}</span>
                      {dayJobs.length > 0 && (
                        <>
                          {isAssigned && <span className="text-[9px] font-extrabold leading-tight tracking-wider" style={{ color: myJobHex }}>YOU</span>}
                          <div className="flex gap-0.5 mt-auto flex-wrap justify-center">
                            {dayJobs.slice(0, 3).map(j => (
                              j.status === 'completed'
                                ? <span key={j.id} className="w-1.5 h-1.5 rounded-full ring-1 ring-emerald-400 ring-offset-[1px] ring-offset-zinc-900"
                                    style={{ backgroundColor: jobColorHex(j.color) + '60' }} />
                                : <span key={j.id} className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: jobColorHex(j.color) }} />
                            ))}
                            {dayJobs.length > 3 && <span className="text-[8px] text-zinc-600 leading-tight">+{dayJobs.length - 3}</span>}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center gap-3 px-2 pb-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm border border-zinc-500" />
                <span className="text-[10px] text-zinc-500">Today</span>
              </div>
              {canSeeAll && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-zinc-900 border border-zinc-700" />
                  <span className="text-[10px] text-zinc-500">Has jobs</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#60a5fa26', border: '2px solid #60a5fab3' }} />
                <span className="text-[10px] text-zinc-500">{canSeeAll ? 'Assigned' : 'Your jobs'}</span>
              </div>
              <div className="flex items-center gap-3 ml-auto flex-wrap">
                {Object.entries(STATUS_COLORS).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                    <span className="text-[10px] text-zinc-600 capitalize">{k.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-2" />
          </>
        )}
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
              const isUpdating = updatingJobId === job.id;
              const jobHex = jobColorHex(job.color);
              return (
                <div key={job.id} className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden flex">
                  {/* Color stripe */}
                  <div className="w-1 shrink-0 rounded-l-xl" style={{ backgroundColor: jobHex }} />
                  <div className="flex-1 min-w-0">
                  <button
                    onClick={() => { setShowDaySheet(false); onOpenJob(job, selectedDate); }}
                    className="w-full text-left px-4 py-3 hover:bg-zinc-700/30 active:bg-zinc-700/50 transition-colors"
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
                        {job.status === 'completed' ? '✓ Done' : job.status.replace('_', ' ')}
                      </span>
                    </div>
                  </button>
                  {/* Worker presence — owner/admin on in_progress jobs */}
                  {canSeeAll && job.status === 'in_progress' && (() => {
                    const presence = workerPresence(job);
                    if (!presence.length) return null;
                    const inCount      = presence.filter(p => p.status === 'in').length;
                    const doneCount    = presence.filter(p => p.status === 'done').length;
                    const pendingCount = presence.filter(p => p.status === 'pending').length;
                    return (
                      <div className="flex items-center gap-2 px-4 pb-2.5 pt-0">
                        <div className="flex items-center gap-1">
                          {presence.map(p => (
                            <div key={p.userId} title={`${p.name} — ${p.status === 'in' ? 'clocked in' : p.status === 'done' ? 'done' : 'not started'}`}
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border-2 ${
                                p.status === 'in'      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                                : p.status === 'done'  ? 'bg-blue-500/15 border-blue-500 text-blue-400'
                                : 'bg-zinc-700 border-zinc-500 text-zinc-300'}`}>
                              {p.initial}
                            </div>
                          ))}
                        </div>
                        <span className="text-[10px]">
                          {inCount > 0 && <span className="text-emerald-400 font-semibold">{inCount} in</span>}
                          {inCount > 0 && (doneCount + pendingCount) > 0 && <span className="text-zinc-700"> · </span>}
                          {doneCount > 0 && <span className="text-blue-400 font-semibold">{doneCount} done</span>}
                          {doneCount > 0 && pendingCount > 0 && <span className="text-zinc-700"> · </span>}
                          {pendingCount > 0 && <span className="text-zinc-600">{pendingCount} pending</span>}
                        </span>
                      </div>
                    );
                  })()}

                  {(canSeeAll || job.job_assignments?.some(a => a.user_id === user?.id)) && (
                    <div className="flex gap-1.5 px-4 pb-3 border-t border-zinc-700/40 pt-2">
                      {job.status === 'scheduled' && (
                        <button onClick={() => handleQuickStatus(job.id, 'in_progress')} disabled={isUpdating}
                          className="flex-1 text-xs text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-lg py-2 font-semibold hover:bg-blue-400/15 disabled:opacity-50 transition-colors">
                          {isUpdating ? '…' : 'Start'}
                        </button>
                      )}
                      {(job.status === 'scheduled' || job.status === 'in_progress') && (
                        <button onClick={() => handleQuickStatus(job.id, 'completed')} disabled={isUpdating}
                          className="flex-1 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg py-2 font-semibold hover:bg-emerald-400/15 disabled:opacity-50 transition-colors">
                          {isUpdating ? '…' : 'Complete'}
                        </button>
                      )}
                      {canSeeAll && job.status !== 'cancelled' && job.status !== 'completed' && (
                        <button onClick={() => handleQuickStatus(job.id, 'cancelled')} disabled={isUpdating}
                          className="flex-1 text-xs text-zinc-500 bg-zinc-700/50 border border-zinc-600 rounded-lg py-2 font-semibold hover:bg-zinc-700 disabled:opacity-50 transition-colors">
                          {isUpdating ? '…' : 'Cancel'}
                        </button>
                      )}
                      {canSeeAll && (job.status === 'cancelled' || job.status === 'completed') && (
                        <button onClick={() => handleQuickStatus(job.id, 'scheduled')} disabled={isUpdating}
                          className="flex-1 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg py-2 font-semibold hover:bg-amber-400/15 disabled:opacity-50 transition-colors">
                          {isUpdating ? '…' : 'Reopen'}
                        </button>
                      )}
                    </div>
                  )}
                  </div>{/* end flex-1 wrapper */}
                </div>
              );
            })
          )}

          {canSeeAll && (
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
const ROLE_STYLES = {
  owner:         { badge: 'bg-amber-400/15 text-amber-400',   avatar: 'bg-amber-400/20 border-amber-400/30 text-amber-400'  },
  admin:         { badge: 'bg-teal-400/15 text-teal-400',     avatar: 'bg-teal-400/15 border-teal-400/20 text-teal-400'     },
  employee:      { badge: 'bg-zinc-800 text-zinc-400',        avatar: 'bg-zinc-800 border-zinc-700 text-zinc-400'           },
  subcontractor: { badge: 'bg-blue-400/15 text-blue-400',     avatar: 'bg-blue-400/15 border-blue-400/20 text-blue-400'    },
};

const ASSIGNABLE_ROLES = [
  { value: 'admin',         label: 'Admin',         style: 'bg-teal-400/15 text-teal-300 border-teal-400/30'   },
  { value: 'employee',      label: 'Employee',      style: 'bg-zinc-800 text-zinc-300 border-zinc-700'         },
  { value: 'subcontractor', label: 'Subcontractor', style: 'bg-blue-400/15 text-blue-300 border-blue-400/30'  },
];

function MembersView({ org, members, onRefresh, addToast, isOwner }) {
  const [copied, setCopied]               = useState(false);
  const [openMenu, setOpenMenu]           = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [working, setWorking]             = useState(null);
  const inviteLink = `${window.location.origin}?join=${org.invite_code}`;

  const share = async () => {
    const shareData = { title: `Join ${org.name} on Docket`, url: inviteLink };
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

  const handleChangeRole = async (m, newRole) => {
    if (m.role === newRole) return;
    const name = m.display_name || m.profiles?.display_name || 'Member';
    setWorking(m.user_id);
    setOpenMenu(null);
    try {
      await orgApi.updateMemberRole(org.id, m.user_id, newRole);
      addToast(`${name} is now ${newRole}`, 'success');
      onRefresh();
    } catch (e) {
      addToast(e?.message || 'Failed to update role', 'error');
    } finally {
      setWorking(null);
    }
  };

  const handleRemove = async (userId, name) => {
    setWorking(userId);
    setOpenMenu(null);
    setConfirmRemove(null);
    try {
      await orgApi.removeMember(org.id, userId);
      addToast(`${name} removed`, 'success');
      onRefresh();
    } catch (e) {
      addToast(e?.message || 'Failed to remove member', 'error');
    } finally {
      setWorking(null);
    }
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
          <p className="text-[10px] text-zinc-600 mt-0.5">Tap ⋯ to change role or remove a member</p>
        </div>
        {members.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-6">No members yet — share your invite code</p>
        )}
        {members.map(m => {
          const name      = m.display_name || m.profiles?.display_name || 'Unknown';
          const email     = m.profiles?.email || '';
          const initials  = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
          const roleStyle = ROLE_STYLES[m.role] || ROLE_STYLES.employee;
          const isWorking = working === m.user_id;
          const menuOpen  = openMenu === m.user_id;
          const removing  = confirmRemove === m.user_id;

          return (
            <div key={m.id} className="border-b border-zinc-800/50 last:border-0">
              {/* Member row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${roleStyle.avatar}`}>
                  {isWorking
                    ? <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    : <span className="text-sm font-bold">{initials}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-100 truncate">{name}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize shrink-0 ${roleStyle.badge}`}>
                      {m.role}
                    </span>
                  </div>
                  {email && <p className="text-xs text-zinc-500 truncate mt-0.5">{email}</p>}
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    Joined {(() => { try { return format(new Date(m.joined_at), 'd MMM yyyy'); } catch { return ''; } })()}
                  </p>
                </div>
                {m.role !== 'owner' && (
                  <button
                    onClick={() => { setOpenMenu(menuOpen ? null : m.user_id); setConfirmRemove(null); }}
                    disabled={isWorking}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors shrink-0 disabled:opacity-40"
                  >
                    <MoreVertical size={17} />
                  </button>
                )}
              </div>

              {/* Inline role menu */}
              {menuOpen && !removing && (
                <div className="px-4 pb-3 space-y-2 border-t border-zinc-800/60 pt-2.5">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Change role</p>
                  <div className="flex gap-2">
                    {ASSIGNABLE_ROLES.map(r => (
                      <button key={r.value}
                        onClick={() => handleChangeRole(m, r.value)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                          m.role === r.value
                            ? r.style + ' ring-1 ring-current/40'
                            : 'bg-zinc-800/50 text-zinc-500 border-zinc-700 hover:text-zinc-200 hover:bg-zinc-800'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-0.5">
                    <button
                      onClick={() => setConfirmRemove(m.user_id)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                    >
                      Remove from Org
                    </button>
                    <button
                      onClick={() => setOpenMenu(null)}
                      className="w-9 flex items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-800 border border-zinc-800 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Confirm remove */}
              {removing && (
                <div className="px-4 pb-3 border-t border-red-900/40 pt-2.5 bg-red-950/20">
                  <p className="text-xs text-red-300 mb-2">Remove <span className="font-semibold">{name}</span> from the organisation?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmRemove(null); setOpenMenu(null); }}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRemove(m.user_id, name)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold bg-red-500 text-white hover:bg-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
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
                className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors active:bg-zinc-800/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {isOwner && (
                      <p className="text-xs font-semibold text-amber-400 mb-0.5 truncate">{s.display_name}</p>
                    )}
                    <p className="font-semibold text-zinc-100 text-sm truncate">
                      {inv.invoiceNumber ? `${inv.invoiceNumber} · ` : ''}{inv.description || 'Invoice'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {(() => { try { return format(new Date(s.submitted_at), 'd MMM yyyy'); } catch { return ''; } })()}
                      {inv.periodFrom && inv.periodTo && (() => {
                        try {
                          return ` · ${format(new Date(inv.periodFrom), 'd MMM')} – ${format(new Date(inv.periodTo), 'd MMM')}`;
                        } catch { return ''; }
                      })()}
                    </p>
                    {inv.hours > 0 && (
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {decimalToHHMM(inv.hours)} · {inv.entries?.length || 0} {inv.entries?.length !== 1 ? 'entries' : 'entry'}
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
  const [expandedEntry, setExpandedEntry] = useState(null);
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

          {/* Line items — tappable */}
          {inv.entries?.length > 0 && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <p className="text-xs text-zinc-500 uppercase tracking-widest">Time Entries</p>
                <p className="text-[10px] text-zinc-600">Tap to expand</p>
              </div>
              <div className="divide-y divide-zinc-700/50">
                {inv.entries.map((e, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setExpandedEntry(expandedEntry === i ? null : i)}
                      className="w-full text-left px-4 py-3 flex justify-between items-start gap-2 hover:bg-zinc-700/30 active:bg-zinc-700/50 transition-colors"
                    >
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <ChevronRight size={13} className={`text-zinc-600 mt-0.5 shrink-0 transition-transform duration-150 ${expandedEntry === i ? 'rotate-90' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {e.description || e.clientName || 'Labour'}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                            {safeDate(e.date, 'EEE d MMM')}
                            {e.timeIn && e.timeOut ? ` · ${e.timeIn}–${e.timeOut}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-semibold text-zinc-100">{formatCurrency(Number(e.earnings) || 0)}</p>
                        <p className="text-xs font-mono text-zinc-500">{decimalToHHMM(Number(e.workingHours))}</p>
                      </div>
                    </button>
                    {expandedEntry === i && (
                      <div className="px-4 pb-3 pt-1 bg-zinc-700/20 border-t border-zinc-700/40 space-y-1.5">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
                          {e.clientName && (
                            <div>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Client</p>
                              <p className="text-xs text-zinc-300 mt-0.5">{e.clientName}</p>
                            </div>
                          )}
                          {e.timeIn && e.timeOut && (
                            <div>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Clock</p>
                              <p className="text-xs font-mono text-zinc-300 mt-0.5">{e.timeIn} – {e.timeOut}</p>
                            </div>
                          )}
                          {Number(e.hourlyRate) > 0 && (
                            <div>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Rate</p>
                              <p className="text-xs font-mono text-zinc-300 mt-0.5">${e.hourlyRate}/hr</p>
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Worked</p>
                            <p className="text-xs font-mono text-zinc-300 mt-0.5">{decimalToHHMM(Number(e.workingHours))}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Earned</p>
                            <p className="text-xs font-mono font-semibold text-amber-400 mt-0.5">{formatCurrency(Number(e.earnings) || 0)}</p>
                          </div>
                        </div>
                      </div>
                    )}
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
  const [filterWorker, setFilterWorker]     = useState('all');
  const [filterStatus, setFilterStatus]     = useState('all');
  const [searchJob, setSearchJob]           = useState('');
  const [dateFrom, setDateFrom]             = useState('');
  const [dateTo, setDateTo]                 = useState('');
  const [groupBy, setGroupBy]               = useState('job');
  const [showFilters, setShowFilters]       = useState(false);

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
        businessName: s.invoice_data?.businessName || '',
      }))
    ), [submissions]);

  const workers = useMemo(() => {
    const names = [...new Set(submissions.map(s => s.display_name).filter(Boolean))];
    return names.sort();
  }, [submissions]);

  const filtered = useMemo(() => allEntries.filter(e => {
    if (filterWorker !== 'all' && e.workerName !== filterWorker) return false;
    if (filterStatus !== 'all' && e.submissionStatus !== filterStatus) return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    if (searchJob) {
      const hay = `${e.clientName || ''} ${e.description || ''}`.toLowerCase();
      if (!hay.includes(searchJob.toLowerCase())) return false;
    }
    return true;
  }), [allEntries, filterWorker, filterStatus, dateFrom, dateTo, searchJob]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      const key = groupBy === 'job' ? (e.clientName || 'Unspecified') : e.workerName;
      if (!map.has(key)) map.set(key, { entries: [], totalHours: 0, totalEarnings: 0, dates: [] });
      const g = map.get(key);
      g.entries.push(e);
      g.totalHours    += Number(e.workingHours) || 0;
      g.totalEarnings += Number(e.earnings) || 0;
      if (e.date) g.dates.push(e.date);
    }
    return [...map.entries()]
      .map(([name, data]) => ({
        name,
        ...data,
        dateRange: data.dates.length > 0
          ? (() => {
              const sorted = [...new Set(data.dates)].sort();
              const fmt = d => { try { return format(new Date(d), 'd MMM'); } catch { return d; } };
              return sorted.length === 1 ? fmt(sorted[0]) : `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}`;
            })()
          : '',
        uniqueDays: new Set(data.dates).size,
        avgRate: data.totalHours > 0
          ? data.totalEarnings / data.totalHours
          : 0,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [filtered, groupBy]);

  const totalHours    = filtered.reduce((s, e) => s + (Number(e.workingHours) || 0), 0);
  const totalEarnings = filtered.reduce((s, e) => s + (Number(e.earnings) || 0), 0);
  const uniqueDays    = new Set(filtered.map(e => e.date).filter(Boolean)).size;
  const hasFilters    = filterWorker !== 'all' || filterStatus !== 'all' || searchJob || dateFrom || dateTo;

  const STATUS_OPTS = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'paid', label: 'Paid' },
    { value: 'rejected', label: 'Rejected' },
  ];

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

            <div className="segmented">
              {STATUS_OPTS.map(o => (
                <button key={o.value} onClick={() => setFilterStatus(o.value)} className={filterStatus === o.value ? 'active' : ''}>
                  {o.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-50 focus:outline-none focus:border-amber-400/50 min-h-[44px]" />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-50 focus:outline-none focus:border-amber-400/50 min-h-[44px]" />
            </div>
            {hasFilters && (
              <button
                onClick={() => { setFilterWorker('all'); setFilterStatus('all'); setSearchJob(''); setDateFrom(''); setDateTo(''); }}
                className="text-xs text-amber-400 hover:text-amber-300 underline-offset-2"
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
      <div className="shrink-0 mx-4 my-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 flex justify-between items-center">
        <div className="text-center">
          <p className="font-mono text-base font-semibold text-zinc-50">{decimalToHHMM(totalHours)}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Hours</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-base font-semibold text-amber-400">{formatCurrency(totalEarnings)}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Cost</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-base font-semibold text-zinc-50">{uniqueDays}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Days</p>
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
          <div className="text-center py-12 space-y-1">
            <p className="text-zinc-400 font-medium text-sm">No data{hasFilters ? ' matching filters' : ''}</p>
            {submissions.length === 0
              ? <p className="text-zinc-600 text-xs">Workers need to submit invoices before data appears here</p>
              : <p className="text-zinc-600 text-xs">Try adjusting or clearing your filters</p>
            }
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
  const [mode, setMode] = useState('summary'); // 'summary' | 'entries'

  const subGroups = useMemo(() => {
    const map = new Map();
    for (const e of group.entries) {
      const key = groupBy === 'job' ? e.workerName : (e.clientName || 'Unspecified');
      if (!map.has(key)) map.set(key, { name: key, hours: 0, earnings: 0, count: 0 });
      const g = map.get(key);
      g.hours    += Number(e.workingHours) || 0;
      g.earnings += Number(e.earnings) || 0;
      g.count++;
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [group.entries, groupBy]);

  const sortedEntries = useMemo(() =>
    [...group.entries].sort((a, b) => b.date?.localeCompare(a.date) || 0),
  [group.entries]);

  const safeDate = d => { try { return format(new Date(d), 'EEE d MMM'); } catch { return d; } };

  const INV_STATUS_DOT = { pending: 'bg-amber-400', approved: 'bg-blue-400', paid: 'bg-emerald-400', rejected: 'bg-red-400' };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header row */}
      <div className="px-4 py-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-100 text-sm truncate">{group.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            <span className="text-xs text-zinc-500">{group.uniqueDays} day{group.uniqueDays !== 1 ? 's' : ''}</span>
            <span className="text-xs text-zinc-500">{group.entries.length} {group.entries.length !== 1 ? 'entries' : 'entry'}</span>
            {group.dateRange && <span className="text-xs text-zinc-600">{group.dateRange}</span>}
            {group.avgRate > 0 && <span className="text-xs text-zinc-600">avg ${group.avgRate.toFixed(0)}/hr</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-sm font-bold text-zinc-100">{decimalToHHMM(group.totalHours)}</p>
          <p className="font-mono text-xs text-amber-400">{formatCurrency(group.totalEarnings)}</p>
        </div>
      </div>

      {/* Expand toggle */}
      <div className="flex border-t border-zinc-800">
        <button
          onClick={() => setMode(m => m === 'summary' ? null : 'summary')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${mode === 'summary' ? 'text-amber-400 bg-zinc-800/60' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {groupBy === 'job' ? 'By Worker' : 'By Job'} ({subGroups.length})
        </button>
        <div className="w-px bg-zinc-800" />
        <button
          onClick={() => setMode(m => m === 'entries' ? null : 'entries')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${mode === 'entries' ? 'text-amber-400 bg-zinc-800/60' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          All Entries ({group.entries.length})
        </button>
      </div>

      {/* Summary sub-groups */}
      {mode === 'summary' && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
          {subGroups.map(sg => (
            <div key={sg.name} className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 truncate">{sg.name}</p>
                <p className="text-xs text-zinc-600">{sg.count} {sg.count !== 1 ? 'entries' : 'entry'}</p>
              </div>
              <div className="text-right ml-3 shrink-0">
                <p className="font-mono text-sm font-medium text-zinc-200">{decimalToHHMM(sg.hours)}</p>
                <p className="font-mono text-xs text-zinc-500">{formatCurrency(sg.earnings)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Individual entries */}
      {mode === 'entries' && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
          {sortedEntries.map((e, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start gap-2">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${INV_STATUS_DOT[e.submissionStatus] || 'bg-zinc-600'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate">
                  {groupBy === 'job' ? e.workerName : (e.clientName || 'Unspecified')}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {safeDate(e.date)}
                  {e.timeIn && e.timeOut ? ` · ${e.timeIn}–${e.timeOut}` : ''}
                  {e.description ? ` · ${e.description}` : ''}
                </p>
                {e.invoiceNumber && (
                  <p className="text-[10px] text-zinc-600 mt-0.5">{e.invoiceNumber} · {e.submissionStatus}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-xs font-semibold text-zinc-200">{formatCurrency(Number(e.earnings) || 0)}</p>
                <p className="font-mono text-[10px] text-zinc-500">{decimalToHHMM(Number(e.workingHours))}</p>
                {Number(e.hourlyRate) > 0 && (
                  <p className="text-[10px] text-zinc-600">${e.hourlyRate}/hr</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Member picker (used by permissions UI) ────────────────────
function MemberPicker({ members, selected, onChange }) {
  const toggle = (uid) =>
    onChange(selected.includes(uid) ? selected.filter(id => id !== uid) : [...selected, uid]);
  return (
    <div className="ml-5 space-y-1 pt-1">
      {members.map(m => {
        const name = m.display_name || m.profiles?.display_name || 'Unknown';
        const on   = selected.includes(m.user_id);
        return (
          <button key={m.user_id} onClick={() => toggle(m.user_id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs transition-colors ${
              on ? 'bg-amber-400/10 border-amber-400/30 text-amber-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }`}>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-amber-400 bg-amber-400' : 'border-zinc-600'}`}>
              {on && <Check size={9} className="text-zinc-950" strokeWidth={3} />}
            </div>
            <span className="truncate">{name}</span>
            <span className="text-[10px] text-zinc-600 capitalize ml-auto shrink-0">{m.role}</span>
          </button>
        );
      })}
      {members.length === 0 && <p className="text-xs text-zinc-600 py-1">No other members yet</p>}
    </div>
  );
}

// ── Notes view (all members) ──────────────────────────────────
// Content is always stored as JSON: { text: string, items: [{id,text,checked}] }
// Backward-compat: plain text → {text, items:[]}; old array → {text:'', items:array}
function NotesView({ orgId, isOwner, isAdmin, members = [], addToast }) {
  const [notes, setNotes]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [editNote, setEditNote]         = useState(null);   // null | 'new' | note obj
  const [editTitle, setEditTitle]       = useState('');
  const [editText, setEditText]         = useState('');
  const [editItems, setEditItems]       = useState([]);
  // 'everyone' | 'admins_only' | 'selected'
  const [editVisibility, setEditVisibility] = useState('everyone');
  const [editEditable,   setEditEditable]   = useState('everyone');
  // arrays of user_id strings for 'selected' mode
  const [editVisUsers, setEditVisUsers] = useState([]);
  const [editEditUsers, setEditEditUsers] = useState([]);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const itemInputRefs                   = useRef([]);
  const textareaRef                     = useRef(null);
  const sheetRef                        = useRef(null);
  const swipeRef                        = useRef(null);
  const noteDragRef                     = useRef({});
  const [noteDragOver, setNoteDragOver] = useState(null);

  const handleSheetTouchStart = (e) => {
    swipeRef.current = { startY: e.touches[0].clientY, dy: 0 };
  };
  const handleSheetTouchMove = (e) => {
    if (!swipeRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - swipeRef.current.startY);
    swipeRef.current.dy = dy;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const handleSheetTouchEnd = () => {
    if (!swipeRef.current || !sheetRef.current) { swipeRef.current = null; return; }
    const dy = swipeRef.current.dy;
    swipeRef.current = null;
    if (dy > 100) {
      sheetRef.current.style.transition = 'transform 0.25s ease';
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => setEditNote(null), 240);
    } else {
      sheetRef.current.style.transition = 'transform 0.2s ease';
      sheetRef.current.style.transform = 'translateY(0)';
      setTimeout(() => { if (sheetRef.current) { sheetRef.current.style.transition = ''; sheetRef.current.style.transform = ''; } }, 200);
    }
  };

  const load = useCallback(async () => {
    try {
      const data = await orgApi.getOrgNotes(orgId);
      setNotes(data);
    } catch (e) {
      addToast(`Failed to load notes: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [orgId, addToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`org-notes-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_notes', filter: `org_id=eq.${orgId}` },
        () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [orgId, load]);

  // Resize note textareas whenever a note is opened or items load
  useEffect(() => {
    if (!editNote) return;
    const resize = () => {
      const main = textareaRef.current;
      if (main) { main.style.height = 'auto'; main.style.height = main.scrollHeight + 'px'; }
      (itemInputRefs.current || []).forEach(el => {
        if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
      });
    };
    resize();
    const t = setTimeout(resize, 60);
    return () => clearTimeout(t);
  }, [editNote, editItems.length]);

  // Parse content (handles new combined format, old array, and plain text)
  const parseContent = (raw) => {
    if (!raw) return { text: '', items: [] };
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return { text: '', items: p };                     // old checklist-only
      if (p && typeof p === 'object') return { text: p.text || '', items: Array.isArray(p.items) ? p.items : [] };
    } catch {}
    return { text: raw, items: [] };                                            // plain text legacy
  };

  const serialize = (text, items) =>
    JSON.stringify({ text, items: items.filter(i => i.text.trim()) });

  const openNew = () => {
    setEditTitle('');
    setEditText('');
    setEditItems([]);
    setEditVisibility('everyone');
    setEditEditable('everyone');
    setEditVisUsers([]);
    setEditEditUsers([]);
    setConfirmDelete(false);
    setEditNote('new');
  };

  const openEdit = (note) => {
    const { text, items } = parseContent(note.content);
    setEditTitle(note.title);
    setEditText(text);
    setEditItems(items);
    setEditVisibility(note.visibility || 'everyone');
    setEditEditable(note.editable_by || 'everyone');
    setEditVisUsers(note.visibility_users || []);
    setEditEditUsers(note.editable_users || []);
    setConfirmDelete(false);
    setEditNote(note);
  };

  // Toggle item → auto-save immediately so teammates see it live
  const handleToggleItem = async (idx) => {
    if (!canEdit) return;
    const newItems = editItems.map((item, i) =>
      i === idx ? { ...item, checked: !item.checked } : item
    );
    setEditItems(newItems);
    if (editNote !== 'new' && editNote?.id) {
      try { await orgApi.updateOrgNote(editNote.id, editTitle, serialize(editText, newItems)); } catch {}
    }
  };

  const handleAddItem = () => {
    setEditItems(prev => {
      const next = [...prev, { id: `${Date.now()}`, text: '', checked: false }];
      setTimeout(() => { itemInputRefs.current[next.length - 1]?.focus(); }, 30);
      return next;
    });
  };

  const handleItemText = (idx, val) =>
    setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, text: val } : item));

  const handleItemKeyDown = (e, idx) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddItem(); }
    if (e.key === 'Backspace' && !editItems[idx].text) {
      e.preventDefault();
      setEditItems(prev => prev.filter((_, i) => i !== idx));
      setTimeout(() => { itemInputRefs.current[idx - 1]?.focus(); }, 30);
    }
  };

  const handleDeleteItem = (idx) =>
    setEditItems(prev => prev.filter((_, i) => i !== idx));

  const onNotePtrDown = (e) => {
    if (!canEdit) return;
    const handle = e.target.closest('[data-dh]');
    if (!handle) return;
    const row = handle.closest('[data-ci]');
    if (!row) return;
    const idx = parseInt(row.dataset.ci, 10);
    handle.setPointerCapture(e.pointerId);
    noteDragRef.current = { pointerId: e.pointerId, fromIdx: idx, overIdx: idx };
    setNoteDragOver(idx);
  };
  const onNotePtrMove = (e) => {
    const d = noteDragRef.current;
    if (d.pointerId === undefined) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-ci]');
    if (row) {
      const idx = parseInt(row.dataset.ci, 10);
      if (!isNaN(idx) && idx !== d.overIdx) { d.overIdx = idx; setNoteDragOver(idx); }
    }
  };
  const onNotePtrUp = () => {
    const d = noteDragRef.current;
    if (d.pointerId === undefined) return;
    const { fromIdx, overIdx } = d;
    noteDragRef.current = {};
    setNoteDragOver(null);
    if (fromIdx !== overIdx) {
      setEditItems(prev => {
        const arr = [...prev];
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(overIdx, 0, moved);
        return arr;
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const content = serialize(editText, editItems);
      if (editNote === 'new') {
        await orgApi.createOrgNote(orgId, editTitle.trim() || 'Untitled Note', content, editVisibility, editEditable, editVisUsers, editEditUsers);
      } else {
        await orgApi.updateOrgNote(editNote.id, editTitle.trim() || 'Untitled Note', content, editVisibility, editEditable, editVisUsers, editEditUsers);
      }
      addToast('Note saved', 'success');
      setEditNote(null);
      await load();
    } catch (e) {
      addToast(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editNote?.id) return;
    setDeleting(true);
    try {
      await orgApi.deleteOrgNote(editNote.id);
      addToast('Note deleted', 'success');
      setEditNote(null);
      setConfirmDelete(false);
      await load();
    } catch (e) {
      addToast(e.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const safeDate = (str) => {
    if (!str) return '';
    try { return format(new Date(str), 'd MMM · h:mm a'); } catch { return ''; }
  };

  const { user: currentUser } = useAuth();
  const myUserId = currentUser?.id;
  const canEdit = isOwner || isAdmin || editNote === 'new'
    || editEditable === 'everyone'
    || (editEditable === 'selected' && editEditUsers.includes(myUserId));

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="flex-1 scroll-area px-4 py-4 space-y-2">
          <button
            onClick={openNew}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-zinc-700 hover:border-amber-400/50 text-zinc-500 hover:text-amber-400 rounded-2xl py-4 min-h-[52px] transition-colors"
          >
            <Plus size={18} />
            New Note
          </button>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3">
                <StickyNote size={22} className="text-zinc-600" />
              </div>
              <p className="text-zinc-500 text-sm">No notes yet</p>
              <p className="text-zinc-600 text-xs mt-1">Shared with everyone in the organisation</p>
            </div>
          ) : (
            notes.map(note => {
              const { text: noteText, items } = parseContent(note.content);
              const doneCount    = items.filter(i => i.checked).length;
              const previewItems = items.slice(0, 3);

              return (
                <button
                  key={note.id}
                  onClick={() => openEdit(note)}
                  className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 active:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <p className="font-semibold text-zinc-100 text-sm">{note.title}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {items.length > 0 && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          doneCount === items.length
                            ? 'bg-emerald-400/15 text-emerald-400'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {doneCount}/{items.length}
                        </span>
                      )}
                      {(isOwner || isAdmin) && (note.visibility !== 'everyone' || note.editable_by !== 'everyone') && (
                        <div className="flex items-center gap-0.5 text-amber-400/60">
                          {note.visibility !== 'everyone' && <Eye size={11} />}
                          {note.editable_by !== 'everyone' && <Lock size={11} />}
                        </div>
                      )}
                    </div>
                  </div>
                  {noteText ? (
                    <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 mb-1.5">{noteText}</p>
                  ) : null}
                  {previewItems.length > 0 && (
                    <div className="space-y-1">
                      {previewItems.map(item => (
                        <div key={item.id} className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full shrink-0 flex items-center justify-center ${
                            item.checked ? 'bg-amber-400' : 'border border-zinc-600'
                          }`}>
                            {item.checked && <Check size={7} className="text-zinc-950" strokeWidth={3} />}
                          </div>
                          <p className={`text-xs truncate ${item.checked ? 'text-zinc-600 line-through' : 'text-zinc-400'}`}>
                            {item.text}
                          </p>
                        </div>
                      ))}
                      {items.length > 3 && (
                        <p className="text-[10px] text-zinc-600 pl-5">+{items.length - 3} more</p>
                      )}
                    </div>
                  )}
                  {!noteText && items.length === 0 && (
                    <p className="text-xs text-zinc-600 italic">Empty note</p>
                  )}
                  <p className="text-[10px] text-zinc-600 mt-2">
                    {note.updated_by_name ? `Edited by ${note.updated_by_name} · ` : ''}{safeDate(note.updated_at)}
                  </p>
                </button>
              );
            })
          )}
          <div className="h-4" />
        </div>
      </div>

      {/* Edit / create sheet */}
      {editNote !== null && (
        <div className="fixed inset-0 z-[55] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setEditNote(null)} />
          <div
            ref={sheetRef}
            className="relative z-10 bg-zinc-900 rounded-t-2xl flex flex-col"
            style={{ maxHeight: '93vh', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
          >
            {/* Handle — drag down to dismiss */}
            <div
              className="flex justify-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing"
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
            >
              <div className="w-10 h-1 rounded-full bg-zinc-700" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800 shrink-0">
              <input
                value={editTitle}
                onChange={e => canEdit && setEditTitle(e.target.value)}
                readOnly={!canEdit}
                placeholder="Note title…"
                className={`flex-1 bg-transparent text-base font-semibold placeholder-zinc-500 focus:outline-none ${canEdit ? 'text-zinc-50' : 'text-zinc-400'}`}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                {editNote !== 'new' && (isOwner || isAdmin) && !confirmDelete && (
                  <button onClick={() => setConfirmDelete(true)}
                    className="text-red-400 hover:bg-red-400/10 rounded-lg px-2 py-1 text-xs font-semibold transition-colors">
                    Delete
                  </button>
                )}
                <button onClick={() => setEditNote(null)}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Inline delete confirm */}
            {confirmDelete && (
              <div className="px-5 py-3 bg-red-950/40 border-b border-red-900/50 shrink-0 flex items-center gap-3">
                <p className="flex-1 text-sm text-red-300">Delete this note?</p>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-xs text-zinc-400 bg-zinc-800 rounded-lg">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 text-xs text-white bg-red-500 hover:bg-red-400 rounded-lg font-semibold disabled:opacity-50">
                  {deleting ? '…' : 'Delete'}
                </button>
              </div>
            )}

            {/* Last-edited info */}
            {editNote !== 'new' && editNote.updated_by_name && (
              <div className="px-5 py-1.5 border-b border-zinc-800/50 shrink-0">
                <p className="text-[10px] text-zinc-600">
                  Last edited by {editNote.updated_by_name} · {safeDate(editNote.updated_at)}
                </p>
              </div>
            )}

            {/* Body — notes + checklist combined */}
            <div className="flex-1 overflow-y-auto">
              {/* Free text section */}
              <div className="px-5 pt-4 pb-3">
                <textarea
                  ref={textareaRef}
                  value={editText}
                  onChange={e => {
                    if (!canEdit) return;
                    setEditText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  readOnly={!canEdit}
                  placeholder={canEdit ? 'Add notes, context, instructions…' : ''}
                  autoFocus={editNote === 'new'}
                  style={{ minHeight: '4.5rem' }}
                  className={`w-full bg-transparent text-sm placeholder-zinc-600 focus:outline-none resize-none leading-relaxed overflow-hidden ${canEdit ? 'text-zinc-200' : 'text-zinc-400'}`}
                />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 px-5 py-1">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Checklist</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              {/* Checklist items */}
              <div
                className="px-5 pt-2 pb-4 space-y-0.5"
                onPointerDown={onNotePtrDown}
                onPointerMove={onNotePtrMove}
                onPointerUp={onNotePtrUp}
              >
                {editItems.map((item, idx) => (
                  <div
                    key={item.id}
                    data-ci={idx}
                    className={`flex items-start gap-3 py-2 border-b border-zinc-800/40 last:border-0 rounded-lg transition-colors ${noteDragOver === idx && noteDragRef.current.fromIdx !== idx ? 'bg-amber-400/8 border-t border-amber-400/30' : ''}`}
                  >
                    {canEdit && (
                      <span data-dh className="shrink-0 mt-1 touch-none cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 select-none">
                        <GripVertical size={13} />
                      </span>
                    )}
                    <button onClick={() => handleToggleItem(idx)} disabled={!canEdit} className="shrink-0 mt-0.5">
                      {item.checked ? (
                        <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow-sm shadow-amber-400/25">
                          <Check size={13} className="text-zinc-950" strokeWidth={3} />
                        </div>
                      ) : (
                        <div className={`w-6 h-6 rounded-full border-2 border-zinc-600 transition-colors ${canEdit ? 'hover:border-zinc-400 active:border-amber-400/70' : 'opacity-50'}`} />
                      )}
                    </button>
                    {canEdit ? (
                      <textarea
                        ref={el => {
                          itemInputRefs.current[idx] = el;
                          if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                        }}
                        value={item.text}
                        onChange={e => {
                          handleItemText(idx, e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onKeyDown={e => handleItemKeyDown(e, idx)}
                        placeholder="Item…"
                        rows={1}
                        style={{ minHeight: '1.5rem' }}
                        className={`flex-1 bg-transparent text-sm focus:outline-none placeholder-zinc-600 resize-none overflow-hidden leading-normal ${
                          item.checked ? 'text-zinc-500 line-through' : 'text-zinc-100'
                        }`}
                      />
                    ) : (
                      <p className={`flex-1 text-sm leading-normal break-words ${item.checked ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{item.text}</p>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleDeleteItem(idx)}
                        className="w-7 h-7 flex items-center justify-center text-zinc-700 hover:text-red-400 active:text-red-400 rounded-lg transition-colors shrink-0 mt-0.5"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}

                {/* Add item */}
                {canEdit && (
                  <button
                    onClick={handleAddItem}
                    className="flex items-center gap-3 py-2.5 text-zinc-600 hover:text-amber-400 active:text-amber-400 transition-colors w-full text-left"
                  >
                    <div className="w-6 h-6 rounded-full border-2 border-dashed border-zinc-700 hover:border-amber-400/40 flex items-center justify-center shrink-0">
                      <Plus size={11} />
                    </div>
                    <span className="text-sm">Add checklist item</span>
                  </button>
                )}
              </div>
            </div>

            {/* Permissions (owner/admin only) */}
            {(isOwner || isAdmin) && (
              <div className="px-5 pt-3 pb-2 border-t border-zinc-800 space-y-4 shrink-0">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">Permissions</p>

                {/* Visible to */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Eye size={13} />
                      <span>Visible to</span>
                    </div>
                    <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                      {['everyone', 'admins_only', 'selected'].map((v, i) => (
                        <button key={v} onClick={() => setEditVisibility(v)}
                          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-zinc-700' : ''} ${editVisibility === v ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}>
                          {v === 'everyone' ? 'All' : v === 'admins_only' ? 'Admins' : 'Choose'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editVisibility === 'selected' && (
                    <MemberPicker
                      members={members.filter(m => m.role !== 'owner')}
                      selected={editVisUsers}
                      onChange={setEditVisUsers}
                    />
                  )}
                </div>

                {/* Editable by */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Pencil size={13} />
                      <span>Editable by</span>
                    </div>
                    <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                      {['everyone', 'admins_only', 'selected'].map((v, i) => (
                        <button key={v} onClick={() => setEditEditable(v)}
                          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-zinc-700' : ''} ${editEditable === v ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}>
                          {v === 'everyone' ? 'All' : v === 'admins_only' ? 'Admins' : 'Choose'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editEditable === 'selected' && (
                    <MemberPicker
                      members={members.filter(m => m.role !== 'owner')}
                      selected={editEditUsers}
                      onChange={setEditEditUsers}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
              {canEdit ? (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-bold rounded-2xl py-4 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Note'}
                </button>
              ) : (
                <div className="w-full flex items-center justify-center gap-2 py-3 text-zinc-600 text-sm">
                  <Lock size={14} />
                  <span>View only</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
