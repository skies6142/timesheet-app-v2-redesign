import { useState, useEffect, useCallback } from 'react';
import { Building2, Share2, Copy, Check, X, Plus, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO, addMonths, subMonths } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import * as orgApi from '../../lib/orgApi';
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

  // Invoice modal
  const [showSubmitInvoice, setShowSubmitInvoice] = useState(false);

  const loadOrg = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await orgApi.getMyOrg();
      if (result?.org) {
        const members = await orgApi.getOrgMembers(result.org.id);
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
  }, [user]);

  useEffect(() => { loadOrg(); }, [loadOrg]);

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
    ? [{ id: 'calendar', label: 'Calendar' }, { id: 'members', label: 'Members' }, { id: 'invoices', label: 'Invoices' }]
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
        onSaved={closeJobModal}
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
      console.error(e);
    } finally {
      setCalLoading(false);
    }
  }, [orgId, year, month]);

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

                return (
                  <button
                    key={date}
                    onClick={() => openDay(date)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-start p-1 transition-colors min-h-[44px] ${
                      isToday ? 'border border-amber-400' : 'border border-transparent'
                    } ${dayJobs.length > 0 ? 'bg-zinc-900 hover:bg-zinc-800' : 'hover:bg-zinc-900/40'}`}
                  >
                    <span className={`text-xs font-medium ${isToday ? 'text-amber-400' : 'text-zinc-300'}`}>{dayNum}</span>
                    {dayJobs.length > 0 && (
                      <>
                        <span className="text-[9px] text-zinc-500 leading-tight">{dayJobs.length}j</span>
                        <div className="flex gap-0.5 mt-auto flex-wrap justify-center">
                          {dayJobs.slice(0, 3).map(j => (
                            <span key={j.id} className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[j.status]?.dot || 'bg-zinc-600'}`} />
                          ))}
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
              const workerNames = job.job_assignments
                ?.map(a => a.profiles?.display_name || 'Unknown')
                .join(', ');
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
                      {workerNames && (
                        <p className="text-xs text-zinc-600 mt-0.5">👷 {workerNames}</p>
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
          const inv   = s.invoice_data || {};
          const total = inv.total || 0;
          return (
            <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0 mr-3">
                  {isOwner && (
                    <p className="text-xs font-semibold text-zinc-400 mb-0.5">{s.display_name}</p>
                  )}
                  <p className="font-semibold text-zinc-100 text-sm truncate">
                    {inv.description || 'Invoice'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {format(parseISO(s.submitted_at), 'd MMM yyyy')}
                    {inv.periodFrom && inv.periodTo && ` · ${format(parseISO(inv.periodFrom), 'd MMM')} – ${format(parseISO(inv.periodTo), 'd MMM')}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-xl font-bold text-amber-400">{formatCurrency(total)}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[s.status] || 'bg-zinc-800 text-zinc-400'} capitalize`}>
                    {s.status}
                  </span>
                </div>
              </div>

              {inv.hours > 0 && (
                <p className="text-xs text-zinc-500 mt-1">
                  {inv.hours.toFixed(2)} hrs · {inv.entries?.length || 0} entr{inv.entries?.length !== 1 ? 'ies' : 'y'}
                </p>
              )}

              {/* Owner action buttons */}
              {isOwner && s.status === 'pending' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                  <button
                    onClick={() => handleStatus(s.id, 'approved')}
                    disabled={updatingId === s.id}
                    className="flex-1 bg-blue-500/15 text-blue-400 border border-blue-500/25 rounded-xl py-2 text-xs font-semibold hover:bg-blue-500/25 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleStatus(s.id, 'paid')}
                    disabled={updatingId === s.id}
                    className="flex-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-xl py-2 text-xs font-semibold hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    Mark Paid
                  </button>
                  <button
                    onClick={() => handleStatus(s.id, 'rejected')}
                    disabled={updatingId === s.id}
                    className="flex-1 bg-red-500/10 text-red-400 border border-red-400/20 rounded-xl py-2 text-xs font-semibold hover:bg-red-500/15 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
              {isOwner && s.status === 'approved' && (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <button
                    onClick={() => handleStatus(s.id, 'paid')}
                    disabled={updatingId === s.id}
                    className="w-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-xl py-2 text-xs font-semibold hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    Mark Paid
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
      <div className="h-4" />
    </div>
  );
}
