import { useState, useEffect, useRef, useCallback } from 'react';
import { X, MapPin, FileText, Users, Camera, Mic, StopCircle, Trash2, Plus, Check, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { addMonths, subMonths, format, parseISO } from 'date-fns';
import * as orgApi from '../../lib/orgApi';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

const STATUS_OPTIONS = [
  { value: 'scheduled',   label: 'Scheduled',   color: 'text-amber-400'   },
  { value: 'in_progress', label: 'In Progress',  color: 'text-blue-400'    },
  { value: 'completed',   label: 'Completed',    color: 'text-emerald-400' },
  { value: 'cancelled',   label: 'Cancelled',    color: 'text-zinc-500'    },
];

export const JOB_COLORS = [
  { id: 'amber',   hex: '#f59e0b' },
  { id: 'blue',    hex: '#60a5fa' },
  { id: 'emerald', hex: '#34d399' },
  { id: 'red',     hex: '#f87171' },
  { id: 'purple',  hex: '#c084fc' },
  { id: 'pink',    hex: '#f472b6' },
  { id: 'orange',  hex: '#fb923c' },
  { id: 'cyan',    hex: '#22d3ee' },
];

export default function JobModal({ isOpen, onClose, onSaved, job, defaultDate, orgId, members, isOwner }) {
  const { addToast } = useApp();
  const { user } = useAuth();

  // Form
  const [title, setTitle]             = useState('');
  const [descText, setDescText]       = useState('');
  const [descItems, setDescItems]     = useState([]);
  const [date, setDate]               = useState(defaultDate || '');
  const [extraDates, setExtraDates]   = useState([]);
  const [location, setLocation]       = useState('');
  const [status, setStatus]           = useState('scheduled');
  const [color, setColor]             = useState('amber');
  const [assignedIds, setAssignedIds] = useState([]);
  const descItemRefs                  = useRef([]);
  const descTextareaRef               = useRef(null);

  // Location autocomplete
  const [locationInput, setLocationInput]     = useState('');
  const [suggestions, setSuggestions]         = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef(null);

  // Media for existing jobs (fetched from Supabase)
  const [media, setMedia]               = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  // Queued media for NEW jobs — held in memory, uploaded after job is created
  const [queuedMedia, setQueuedMedia] = useState([]);

  // Recording
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs]     = useState(0);
  const recorderRef = useRef(null);
  const recTimerRef = useRef(null);

  // UI
  const [saving, setSaving]                   = useState(false);
  const [deleting, setDeleting]               = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [uploading, setUploading]             = useState(false);
  const [updatingStatus, setUpdatingStatus]   = useState(false);
  const [editScope, setEditScope]             = useState('single'); // 'single' | 'series'
  const photoInputRef = useRef(null);

  const isNew        = !job?.id;
  const canEdit      = isOwner;
  const isAssigned   = !isNew && !!user && (job?.job_assignments?.some(a => a.user_id === user.id) ?? false);
  const canTickItems = canEdit || isAssigned; // workers can check off items
  const hasSeries    = !!job?.series_id;

  const parseDesc = (raw) => {
    if (!raw) return { text: '', items: [] };
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return { text: '', items: p };
      if (p && typeof p === 'object') return { text: p.text || '', items: Array.isArray(p.items) ? p.items : [] };
    } catch {}
    return { text: raw, items: [] };
  };
  const serializeDesc = (text, items) =>
    JSON.stringify({ text, items: items.filter(i => i.text.trim()) });

  // Reset form when opening with a different job / defaultDate
  useEffect(() => {
    if (job) {
      const { text, items } = parseDesc(job.description);
      setTitle(job.title || '');
      setDescText(text);
      setDescItems(items);
      setDate(job.date || defaultDate || '');
      setExtraDates([]);
      setLocation(job.location || '');
      setLocationInput(job.location || '');
      setStatus(job.status || 'scheduled');
      setColor(job.color || 'amber');
      setAssignedIds(job.job_assignments?.map(a => a.user_id) || []);
    } else {
      setTitle('');
      setDescText('');
      setDescItems([]);
      setDate(defaultDate || '');
      setExtraDates([]);
      setLocation('');
      setLocationInput('');
      setStatus('scheduled');
      setColor('amber');
      setAssignedIds([]);
    }
    // Revoke any blob URLs from the previous open
    setQueuedMedia(prev => {
      prev.forEach(item => { try { URL.revokeObjectURL(item.preview); } catch {} });
      return [];
    });
    setSuggestions([]);
    setMedia([]);
  }, [job, defaultDate]);

  // Reset series scope when opening a different job
  useEffect(() => { setEditScope('single'); setShowDeleteConfirm(false); }, [job?.id]);

  // Realtime: sync checklist state while modal is open (other users ticking items)
  useEffect(() => {
    if (!job?.id) return;
    const channel = supabase
      .channel(`job-modal-${job.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${job.id}` },
        (payload) => {
          const { items: newItems } = parseDesc(payload.new?.description || '');
          setDescItems(newItems);
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [job?.id]);

  // Load media for existing jobs
  const loadMedia = useCallback(async () => {
    if (!job?.id) return;
    setMediaLoading(true);
    try {
      const items = await orgApi.getJobMedia(job.id);
      setMedia(items);
    } catch (e) {
      console.error(e);
    } finally {
      setMediaLoading(false);
    }
  }, [job?.id]);

  useEffect(() => { if (isOpen) loadMedia(); }, [isOpen, loadMedia]);

  if (!isOpen) return null;

  // ── Location autocomplete ──────────────────────────────────────
  const handleLocationChange = (val) => {
    setLocationInput(val);
    setLocation(val);
    clearTimeout(suggestTimer.current);
    if (val.length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(val)}&limit=5`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {}
    }, 500);
  };

  const selectSuggestion = (s) => {
    const numMatch = locationInput.trim().match(/^(\d+[a-zA-Z]?)\s/);
    const name = (numMatch && !s.address?.house_number)
      ? `${numMatch[1]} ${s.display_name}`
      : s.display_name;
    setLocation(name);
    setLocationInput(name);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // ── Save / delete ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) { addToast('Title is required', 'error'); return; }
    if (!date)         { addToast('Date is required',  'error'); return; }
    setSaving(true);
    const description = serializeDesc(descText, descItems);
    try {
      if (isNew) {
        const allDates = [date, ...extraDates].filter(Boolean);
        const seriesId = allDates.length > 1 ? crypto.randomUUID() : undefined;
        const jobs = await Promise.all(allDates.map(d =>
          orgApi.createJob(orgId, {
            title: title.trim(), description, date: d,
            location: location.trim(), assignedUserIds: assignedIds, seriesId, color,
          })
        ));
        for (const item of queuedMedia) {
          try { await orgApi.uploadJobMedia(jobs[0].id, item.file, item.type, '', true); }
          catch (uploadErr) { addToast(`Media upload failed: ${uploadErr.message}`, 'error'); }
        }
        addToast(jobs.length > 1 ? `${jobs.length} jobs created` : 'Job created', 'success');
        onSaved(jobs[0]);
      } else if (editScope === 'series' && hasSeries) {
        await orgApi.updateJobSeries(job.series_id, {
          title: title.trim(), description,
          location: location.trim(), status, color, assignedUserIds: assignedIds,
        });
        addToast('All days in series updated', 'success');
        onSaved();
      } else {
        await orgApi.updateJob(job.id, {
          title: title.trim(), description, date,
          location: location.trim(), status, color, assignedUserIds: assignedIds,
        });
        addToast('Job saved', 'success');
        onSaved();
      }
    } catch (e) {
      addToast(e.message || 'Failed to save job', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (scope = 'single') => {
    if (!job?.id) return;
    setDeleting(true);
    try {
      if (scope === 'series' && job.series_id) {
        await orgApi.deleteJobSeries(job.series_id);
        addToast('All days deleted', 'success');
      } else {
        await orgApi.deleteJob(job.id);
        addToast('Job deleted', 'success');
      }
      setShowDeleteConfirm(false);
      onSaved();
    } catch (e) {
      addToast(e.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleWorkerStatus = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      await orgApi.updateJobStatus(job.id, newStatus);
      setStatus(newStatus);
      addToast(`Job ${newStatus.replace('_', ' ')}`, 'success');
      onSaved();
    } catch (e) {
      addToast(e.message || 'Failed to update status', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleWorkerSave = async () => {
    if (!job?.id) return;
    setSaving(true);
    try {
      const serialized = serializeDesc(descText, descItems);
      if (job.series_id) {
        await orgApi.updateJobSeries(job.series_id, { description: serialized });
      } else {
        await orgApi.updateJobDescription(job.id, serialized);
      }
      addToast('Saved', 'success');
      onSaved(); // closes modal + refreshes calendar so reopening shows fresh data
    } catch (e) {
      addToast(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAssign = (uid) =>
    setAssignedIds(ids => ids.includes(uid) ? ids.filter(i => i !== uid) : [...ids, uid]);

  // ── Checklist helpers ──────────────────────────────────────────
  const handleAddDescItem = () => {
    setDescItems(prev => {
      const next = [...prev, { id: `${Date.now()}`, text: '', checked: false }];
      setTimeout(() => { descItemRefs.current[next.length - 1]?.focus(); }, 30);
      return next;
    });
  };
  const handleToggleDescItem = async (idx) => {
    const newItems = descItems.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item);
    setDescItems(newItems);
    if (!isNew && job?.id) {
      const serialized = serializeDesc(descText, newItems);
      try {
        if (job.series_id) {
          await orgApi.updateJobSeries(job.series_id, { description: serialized });
        } else {
          await orgApi.updateJobDescription(job.id, serialized);
        }
      } catch {}
    }
  };
  const handleDescItemText = (idx, val) =>
    setDescItems(prev => prev.map((item, i) => i === idx ? { ...item, text: val } : item));
  const handleDescItemKeyDown = (e, idx) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddDescItem(); }
    if (e.key === 'Backspace' && !descItems[idx].text) {
      e.preventDefault();
      setDescItems(prev => prev.filter((_, i) => i !== idx));
      setTimeout(() => { descItemRefs.current[idx - 1]?.focus(); }, 30);
    }
  };
  const handleDeleteDescItem = (idx) => setDescItems(prev => prev.filter((_, i) => i !== idx));

  // ── Multi-date helpers ─────────────────────────────────────────
  const toggleExtraDate = (d) =>
    setExtraDates(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // ── Photo upload ───────────────────────────────────────────────
  const handlePhotoChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';

    if (isNew) {
      // Queue with a local preview — will upload after job creation
      setQueuedMedia(prev => [
        ...prev,
        ...files.map(file => ({ file, type: 'photo', preview: URL.createObjectURL(file) })),
      ]);
    } else {
      setUploading(true);
      for (const file of files) {
        try {
          await orgApi.uploadJobMedia(job.id, file, 'photo', '', isOwner);
        } catch (uploadErr) {
          addToast(`Photo upload failed: ${uploadErr.message}`, 'error');
        }
      }
      setUploading(false);
      await loadMedia();
    }
  };

  // ── Voice recording ────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        const ext  = mimeType.includes('webm') ? 'webm' : 'mp4';
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType });

        if (isNew) {
          // Queue with a local audio preview
          setQueuedMedia(prev => [...prev, { file, type: 'voice', preview: URL.createObjectURL(blob) }]);
          addToast('Voice memo added', 'success');
        } else {
          try {
            await orgApi.uploadJobMedia(job.id, file, 'voice', '', isOwner);
            await loadMedia();
            addToast('Voice memo saved', 'success');
          } catch (uploadErr) {
            addToast(`Voice upload failed: ${uploadErr.message}`, 'error');
          }
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch {
      addToast('Microphone access denied', 'error');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    clearInterval(recTimerRef.current);
    setRecording(false);
    setRecSecs(0);
  };

  const handleDeleteMedia = async (item) => {
    if (!confirm('Delete this media?')) return;
    try {
      await orgApi.deleteJobMedia(item.id, item.storage_path);
      await loadMedia();
    } catch {
      addToast('Failed to delete', 'error');
    }
  };

  const removeQueued = (idx) =>
    setQueuedMedia(prev => {
      try { URL.revokeObjectURL(prev[idx].preview); } catch {}
      return prev.filter((_, i) => i !== idx);
    });

  const ownerMedia  = media.filter(m => m.is_owner_post);
  const workerMedia = media.filter(m => !m.is_owner_post);
  const fmtSecs = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const mapQuery = (canEdit ? locationInput : location)?.trim();
  const mapUrl   = mapQuery
    ? `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed&z=16`
    : null;

  const saveBtnLabel = saving
    ? (isNew && queuedMedia.length > 0 ? 'Creating & uploading…' : 'Saving…')
    : isNew
    ? `Create Job${queuedMedia.length > 0 ? ` + ${queuedMedia.length} file${queuedMedia.length > 1 ? 's' : ''}` : ''}`
    : 'Save Changes';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 bg-zinc-900 rounded-t-2xl flex flex-col"
        style={{ maxHeight: '95vh', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-base font-semibold text-zinc-50">
            {isNew ? 'New Job' : canEdit ? 'Edit Job' : 'Job Details'}
          </h2>
          <div className="flex items-center gap-2">
            {!isNew && canEdit && !showDeleteConfirm && (
              <button onClick={() => setShowDeleteConfirm(true)}
                className="text-red-400 hover:bg-red-400/10 rounded-lg px-2 py-1 text-xs font-semibold">
                Delete
              </button>
            )}
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Inline delete confirm */}
        {showDeleteConfirm && (
          <div className="px-5 py-3 bg-red-950/40 border-b border-red-900/50 shrink-0">
            <p className="text-sm text-red-300 mb-2.5">
              {hasSeries ? 'Delete just this day, or all days in the series?' : 'Delete this job?'}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-3 py-2 text-xs text-zinc-400 bg-zinc-800 rounded-xl">Cancel</button>
              {hasSeries && (
                <button onClick={() => handleDelete('single')} disabled={deleting}
                  className="flex-1 px-3 py-2 text-xs text-white bg-red-700 hover:bg-red-600 rounded-xl font-semibold disabled:opacity-50">
                  {deleting ? '…' : 'This day'}
                </button>
              )}
              <button onClick={() => handleDelete(hasSeries ? 'series' : 'single')} disabled={deleting}
                className="flex-1 px-3 py-2 text-xs text-white bg-red-500 hover:bg-red-400 rounded-xl font-semibold disabled:opacity-50">
                {deleting ? '…' : hasSeries ? 'All days' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        {/* Series scope selector — shown when editing a job that belongs to a series */}
        {!isNew && canEdit && hasSeries && (
          <div className="px-5 py-2.5 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <CalendarDays size={13} className="text-zinc-500 shrink-0" />
              <p className="text-xs text-zinc-500 mr-auto">Part of a multi-day series</p>
              <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                <button onClick={() => setEditScope('single')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${editScope === 'single' ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  This day
                </button>
                <button onClick={() => setEditScope('series')}
                  className={`px-2.5 py-1 text-xs font-medium border-l border-zinc-700 transition-colors ${editScope === 'series' ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  All days
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Single shared file input */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePhotoChange}
        />

        {/* Scrollable body */}
        <div className="flex-1 scroll-area overflow-y-auto px-5 py-4 space-y-5">

          {/* Title + Color */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Job Title *</label>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Roof repair at 42 Oak St"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50" />
                {/* Color dot button — opens picker */}
                <div className="relative shrink-0 group">
                  <button
                    style={{ backgroundColor: JOB_COLORS.find(c => c.id === color)?.hex || '#f59e0b' }}
                    className="w-10 h-10 rounded-xl border-2 border-transparent group-focus-within:border-white focus:outline-none transition-all"
                    title="Pick colour"
                    onClick={e => { e.currentTarget.nextSibling.classList.toggle('hidden'); }}
                  />
                  <div className="hidden absolute top-12 right-0 bg-zinc-800 border border-zinc-700 rounded-2xl p-3 z-20 shadow-2xl grid grid-cols-4 gap-2 w-44">
                    {JOB_COLORS.map(c => (
                      <button key={c.id} onClick={() => setColor(c.id)}
                        style={{ backgroundColor: c.hex }}
                        className={`w-8 h-8 rounded-xl transition-transform hover:scale-110 ${color === c.id ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-800' : ''}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-3 h-8 rounded-full shrink-0" style={{ backgroundColor: JOB_COLORS.find(c => c.id === color)?.hex || '#f59e0b' }} />
                <p className="text-zinc-100 font-semibold">{title}</p>
              </div>
            )}
          </div>

          {/* Date + Status */}
          {isNew ? (
            <div className="space-y-3">
              <label className="block text-xs text-zinc-500 uppercase tracking-widest">Date(s) *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm text-zinc-100 focus:outline-none focus:border-amber-400/50" />
              {/* Mini calendar for additional dates */}
              <MultiDatePicker primaryDate={date} extraDates={extraDates} onToggle={toggleExtraDate} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Date *</label>
                {canEdit ? (
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm text-zinc-100 focus:outline-none focus:border-amber-400/50" />
                ) : (
                  <p className="text-zinc-100">{date ? format(parseISO(date), 'd MMM yyyy') : '—'}</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Status</label>
                {canEdit ? (
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm text-zinc-100 focus:outline-none focus:border-amber-400/50">
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                ) : (
                  <p className={`font-semibold capitalize ${STATUS_OPTIONS.find(s => s.value === status)?.color}`}>
                    {status.replace('_', ' ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Location + map */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">
              <MapPin size={11} className="inline mr-1" />Location
            </label>
            {canEdit ? (
              <div className="relative">
                <input
                  value={locationInput}
                  onChange={e => handleLocationChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Start typing an address…"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
                />
                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-600 rounded-xl overflow-hidden z-20 shadow-2xl">
                    {suggestions.map((s, i) => (
                      <button key={i} type="button" onMouseDown={() => selectSuggestion(s)}
                        className="w-full text-left px-3 py-2.5 text-xs text-zinc-200 hover:bg-zinc-700 border-b border-zinc-700/50 last:border-0 flex items-start gap-2">
                        <MapPin size={11} className="text-zinc-500 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{s.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-zinc-300">{location || '—'}</p>
            )}
            {mapUrl && (
              <div className="mt-2 rounded-xl overflow-hidden border border-zinc-700" style={{ height: 220 }}>
                <iframe title="Job location" src={mapUrl} width="100%" height="220"
                  style={{ border: 0, display: 'block' }} loading="lazy" referrerPolicy="no-referrer" />
              </div>
            )}
          </div>

          {/* Notes / Instructions — combined text + checklist */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">
              <FileText size={11} className="inline mr-1" />Notes / Instructions
            </label>
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
              {/* Free text */}
              <div className="px-4 pt-3 pb-2">
                {canEdit ? (
                  <textarea
                    ref={descTextareaRef}
                    value={descText}
                    onChange={e => {
                      setDescText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    placeholder="Describe the job, tools to bring, safety notes…"
                    style={{ minHeight: '3.5rem', height: 'auto' }}
                    className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none leading-relaxed overflow-hidden"
                  />
                ) : (
                  <p className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed py-1">{descText || <span className="text-zinc-600 italic">No notes</span>}</p>
                )}
              </div>

              {/* Divider */}
              {(descItems.length > 0 || canEdit) && (
                <div className="flex items-center gap-2 px-4 py-1">
                  <div className="flex-1 h-px bg-zinc-700" />
                  <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Checklist</span>
                  <div className="flex-1 h-px bg-zinc-700" />
                </div>
              )}

              {/* Checklist items */}
              <div className="px-4 pt-1 pb-2 space-y-0.5">
                {descItems.map((item, idx) => (
                  <div key={item.id} className="flex items-start gap-3 py-1.5">
                    <button onClick={() => canTickItems && handleToggleDescItem(idx)} disabled={!canTickItems} className="shrink-0 mt-0.5">
                      {item.checked ? (
                        <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                          <Check size={11} className="text-zinc-950" strokeWidth={3} />
                        </div>
                      ) : (
                        <div className={`w-5 h-5 rounded-full border-2 border-zinc-600 transition-colors ${canTickItems ? 'hover:border-zinc-400' : 'opacity-40'}`} />
                      )}
                    </button>
                    {canEdit ? (
                      <textarea
                        ref={el => { descItemRefs.current[idx] = el; }}
                        value={item.text}
                        onChange={e => {
                          handleDescItemText(idx, e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onKeyDown={e => handleDescItemKeyDown(e, idx)}
                        placeholder="Item…"
                        rows={1}
                        style={{ minHeight: '1.5rem', height: 'auto' }}
                        className={`flex-1 bg-transparent text-sm focus:outline-none placeholder-zinc-600 resize-none overflow-hidden leading-normal ${item.checked ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}
                      />
                    ) : (
                      <p className={`flex-1 text-sm leading-normal break-words ${item.checked ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{item.text}</p>
                    )}
                    {canEdit && (
                      <button onClick={() => handleDeleteDescItem(idx)} className="w-6 h-6 flex items-center justify-center text-zinc-700 hover:text-red-400 rounded-lg shrink-0 mt-0.5">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <button onClick={handleAddDescItem}
                    className="flex items-center gap-2.5 py-2 text-zinc-600 hover:text-amber-400 transition-colors w-full text-left">
                    <div className="w-5 h-5 rounded-full border-2 border-dashed border-zinc-600 hover:border-amber-400/50 flex items-center justify-center shrink-0">
                      <Plus size={9} />
                    </div>
                    <span className="text-xs">Add checklist item</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Assign workers */}
          {members.filter(m => m.role !== 'owner').length > 0 && (
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-2">
                <Users size={11} className="inline mr-1" />Assigned Workers
              </label>
              <div className="space-y-2">
                {members.filter(m => m.role !== 'owner').map(m => {
                  const name = m.profiles?.display_name || m.display_name || m.profiles?.email || 'Unknown';
                  const assigned = assignedIds.includes(m.user_id);
                  return (
                    <button key={m.id} onClick={() => canEdit && toggleAssign(m.user_id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                        assigned ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                        : canEdit ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'} ${!canEdit ? 'cursor-default' : ''}`}>
                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold">{name[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-[10px] capitalize text-zinc-600">{m.role}</p>
                      </div>
                      {canEdit && (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          assigned ? 'border-amber-400 bg-amber-400' : 'border-zinc-600'}`}>
                          {assigned && <span className="text-[10px] text-zinc-950 font-bold">✓</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Media: Boss posts (owner upload buttons + content) ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-zinc-500 uppercase tracking-widest">
                {isNew ? 'Attach Media' : 'Boss Posts'}
              </label>
              {isOwner && (
                <div className="flex gap-2">
                  <button onClick={() => photoInputRef.current?.click()} disabled={uploading}
                    className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/15 px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                    <Camera size={13} />
                    {uploading ? 'Uploading…' : 'Photo'}
                  </button>
                  <button
                    onClick={recording ? stopRecording : startRecording}
                    disabled={uploading}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-50 ${
                      recording ? 'text-red-400 bg-red-400/15 animate-pulse' : 'text-zinc-400 bg-zinc-800 hover:bg-zinc-700'}`}>
                    {recording ? <StopCircle size={13} /> : <Mic size={13} />}
                    {recording ? `Stop ${fmtSecs(recSecs)}` : 'Voice'}
                  </button>
                </div>
              )}
            </div>

            {/* New job: queued previews */}
            {isNew && (
              queuedMedia.length > 0 ? (
                <div className="space-y-2">
                  {queuedMedia.map((item, idx) => (
                    <div key={idx} className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
                      {item.type === 'photo' && (
                        <img src={item.preview} alt="preview" className="w-full max-h-48 object-cover" />
                      )}
                      {item.type === 'voice' && (
                        <div className="px-3 py-3 flex items-center gap-3">
                          <Mic size={16} className="text-amber-400 shrink-0" />
                          <audio controls src={item.preview} className="flex-1 h-8" style={{ minWidth: 0 }} />
                        </div>
                      )}
                      <div className="flex items-center justify-between px-3 py-2">
                        <p className="text-[10px] text-zinc-500">
                          {item.type === 'photo' ? 'Photo' : 'Voice memo'} — uploads on save
                        </p>
                        <button onClick={() => removeQueued(idx)}
                          className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600 italic py-1">No media attached — optional</p>
              )
            )}

            {/* Existing job: uploaded boss media */}
            {!isNew && (
              mediaLoading ? (
                <p className="text-xs text-zinc-600 py-2">Loading…</p>
              ) : ownerMedia.length === 0 ? (
                <p className="text-xs text-zinc-600 py-2 italic">No posts yet</p>
              ) : (
                <MediaGrid items={ownerMedia} onDelete={isOwner ? handleDeleteMedia : null} userId={user?.id} members={members} />
              )
            )}
          </div>

          {/* ── Media: Worker responses (existing jobs only) ── */}
          {!isNew && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-zinc-500 uppercase tracking-widest">Worker Responses</label>
                {!isOwner && (
                  <button onClick={() => photoInputRef.current?.click()} disabled={uploading}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                    <Camera size={13} />
                    {uploading ? 'Uploading…' : 'Add Photo'}
                  </button>
                )}
              </div>
              {workerMedia.length === 0 ? (
                <p className="text-xs text-zinc-600 py-2 italic">No responses yet</p>
              ) : (
                <MediaGrid
                  items={workerMedia}
                  onDelete={item => (item.uploaded_by === user?.id || isOwner) ? handleDeleteMedia(item) : null}
                  userId={user?.id}
                  members={members}
                />
              )}
            </div>
          )}

          <div className="h-2" />
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
            <button onClick={handleSave} disabled={saving}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-bold rounded-2xl py-4">
              {saveBtnLabel}
            </button>
          </div>
        )}
        {!canEdit && !isNew && isAssigned && (
          <div className="px-5 py-4 border-t border-zinc-800 shrink-0 space-y-2">
            {/* Status action buttons */}
            {status === 'scheduled' && (
              <button onClick={() => handleWorkerStatus('in_progress')} disabled={updatingStatus}
                className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold rounded-2xl py-4 transition-colors">
                {updatingStatus ? 'Updating…' : 'Start Job'}
              </button>
            )}
            {status === 'in_progress' && (
              <button onClick={() => handleWorkerStatus('completed')} disabled={updatingStatus}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold rounded-2xl py-4 transition-colors">
                {updatingStatus ? 'Updating…' : 'Mark Complete'}
              </button>
            )}
            {/* Save checklist / notes changes */}
            <button onClick={handleWorkerSave} disabled={saving}
              className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-zinc-200 font-semibold rounded-2xl py-3.5 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MultiDatePicker({ primaryDate, extraDates, onToggle }) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(() => {
    if (primaryDate) { try { return new Date(primaryDate + 'T00:00:00'); } catch {} }
    return today;
  });

  // Keep viewMonth in sync when primaryDate changes
  useEffect(() => {
    if (primaryDate) { try { setViewMonth(new Date(primaryDate + 'T00:00:00')); } catch {} }
  }, [primaryDate]);

  const year  = viewMonth.getFullYear();
  const month = viewMonth.getMonth(); // 0-indexed
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysCount = new Date(year, month + 1, 0).getDate();
  const pad = Array(firstDow).fill(null);
  const days = Array.from({ length: daysCount }, (_, i) => i + 1);

  const toStr = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  if (!primaryDate) return null;

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setViewMonth(m => subMonths(m, 1))} className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-zinc-200 rounded-lg">
          <ChevronLeft size={15} />
        </button>
        <p className="text-xs font-semibold text-zinc-300">
          {viewMonth.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
        </p>
        <button onClick={() => setViewMonth(m => addMonths(m, 1))} className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-zinc-200 rounded-lg">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-zinc-600 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {pad.map((_, i) => <div key={`p${i}`} />)}
        {days.map(d => {
          const str = toStr(d);
          const isPrimary = str === primaryDate;
          const isExtra   = extraDates.includes(str);
          const isSelected = isPrimary || isExtra;
          return (
            <button key={d} onClick={() => !isPrimary && onToggle(str)}
              disabled={isPrimary}
              className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                isPrimary ? 'bg-amber-400 text-zinc-950 cursor-default'
                : isExtra  ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40'
                : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}>
              {d}
            </button>
          );
        })}
      </div>
      {extraDates.length > 0 && (
        <p className="text-[10px] text-amber-400/70 text-center mt-2">
          +{extraDates.length} extra day{extraDates.length !== 1 ? 's' : ''} — creates {extraDates.length + 1} jobs
        </p>
      )}
      <p className="text-[10px] text-zinc-600 text-center mt-1">Tap dates to repeat this job on multiple days</p>
    </div>
  );
}

function MediaGrid({ items, onDelete, userId, members = [] }) {
  const nameFor = (uploadedBy) => {
    const m = members.find(m => m.user_id === uploadedBy);
    return m?.profiles?.display_name || m?.display_name || 'Unknown';
  };

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
          {item.type === 'photo' && item.url && (
            <img src={item.url} alt={item.caption || 'Job photo'} className="w-full max-h-64 object-cover" />
          )}
          {item.type === 'voice' && item.url && (
            <div className="px-3 py-3 flex items-center gap-3">
              <Mic size={16} className="text-amber-400 shrink-0" />
              <audio controls src={item.url} className="flex-1 h-8" style={{ minWidth: 0 }} />
            </div>
          )}
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-[10px] text-zinc-600">
              {nameFor(item.uploaded_by)} · {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
            </p>
            {onDelete && (
              <button onClick={() => onDelete(item)}
                className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg ml-2 shrink-0">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
