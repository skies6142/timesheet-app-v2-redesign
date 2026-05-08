import { useState, useEffect, useRef, useCallback } from 'react';
import { X, MapPin, FileText, Users, Camera, Mic, StopCircle, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as orgApi from '../../lib/orgApi';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

const STATUS_OPTIONS = [
  { value: 'scheduled',   label: 'Scheduled',   color: 'text-amber-400'   },
  { value: 'in_progress', label: 'In Progress',  color: 'text-blue-400'    },
  { value: 'completed',   label: 'Completed',    color: 'text-emerald-400' },
  { value: 'cancelled',   label: 'Cancelled',    color: 'text-zinc-500'    },
];

export default function JobModal({ isOpen, onClose, onSaved, job, defaultDate, orgId, members, isOwner }) {
  const { addToast } = useApp();
  const { user } = useAuth();

  // Form fields
  const [title, setTitle]               = useState('');
  const [description, setDescription]   = useState('');
  const [date, setDate]                 = useState(defaultDate || '');
  const [location, setLocation]         = useState('');
  const [status, setStatus]             = useState('scheduled');
  const [assignedIds, setAssignedIds]   = useState([]);

  // Location autocomplete
  const [locationInput, setLocationInput]       = useState('');
  const [suggestions, setSuggestions]           = useState([]);
  const [showSuggestions, setShowSuggestions]   = useState(false);
  const [mapCoords, setMapCoords]               = useState(null);
  const suggestTimer = useRef(null);

  // Media
  const [media, setMedia]               = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  // Recording
  const [recording, setRecording]       = useState(false);
  const [recSecs, setRecSecs]           = useState(0);
  const recorderRef = useRef(null);
  const recTimerRef = useRef(null);

  // UI
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [uploading, setUploading]       = useState(false);
  const photoInputRef = useRef(null);

  const isNew = !job?.id;
  const canEdit = isOwner;

  // Populate form when job/defaultDate changes
  useEffect(() => {
    if (job) {
      setTitle(job.title || '');
      setDescription(job.description || '');
      setDate(job.date || defaultDate || '');
      setLocation(job.location || '');
      setLocationInput(job.location || '');
      setStatus(job.status || 'scheduled');
      setAssignedIds(job.job_assignments?.map(a => a.user_id) || []);
    } else {
      setTitle('');
      setDescription('');
      setDate(defaultDate || '');
      setLocation('');
      setLocationInput('');
      setStatus('scheduled');
      setAssignedIds([]);
    }
    setMapCoords(null);
    setSuggestions([]);
    setMedia([]);
  }, [job, defaultDate]);

  // Geocode existing job location to show map on open
  useEffect(() => {
    if (!isOpen || !job?.location) { setMapCoords(null); return; }
    let cancelled = false;
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(job.location)}&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.length > 0) {
          setMapCoords({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, job?.location]);

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

  // Location autocomplete handlers
  const handleLocationChange = (val) => {
    setLocationInput(val);
    setLocation(val);
    setMapCoords(null);
    clearTimeout(suggestTimer.current);
    if (val.length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {}
    }, 500);
  };

  const selectSuggestion = (s) => {
    const name = s.display_name;
    setLocation(name);
    setLocationInput(name);
    setMapCoords({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSave = async () => {
    if (!title.trim()) { addToast('Title is required', 'error'); return; }
    if (!date) { addToast('Date is required', 'error'); return; }
    setSaving(true);
    try {
      if (isNew) {
        const newJob = await orgApi.createJob(orgId, {
          title: title.trim(), description, date, location: location.trim(), assignedUserIds: assignedIds,
        });
        addToast('Job created', 'success');
        onSaved(newJob);
      } else {
        await orgApi.updateJob(job.id, {
          title: title.trim(), description, date, location: location.trim(), status, assignedUserIds: assignedIds,
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

  const handleDelete = async () => {
    if (!job?.id || !confirm('Delete this job?')) return;
    setDeleting(true);
    try {
      await orgApi.deleteJob(job.id);
      addToast('Job deleted', 'success');
      onSaved();
    } catch (e) {
      addToast(e.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleAssign = (userId) => {
    setAssignedIds(ids => ids.includes(userId) ? ids.filter(i => i !== userId) : [...ids, userId]);
  };

  const handlePhotoChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !job?.id) return;
    setUploading(true);
    for (const file of files) {
      try {
        await orgApi.uploadJobMedia(job.id, file, 'photo', '', isOwner);
      } catch {
        addToast('Failed to upload photo', 'error');
      }
    }
    setUploading(false);
    e.target.value = '';
    await loadMedia();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
        const file = new File([new Blob(chunks, { type: mimeType })], `voice-${Date.now()}.${ext}`, { type: mimeType });
        try {
          await orgApi.uploadJobMedia(job.id, file, 'voice', '', isOwner);
          await loadMedia();
          addToast('Voice memo saved', 'success');
        } catch {
          addToast('Failed to upload voice memo', 'error');
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

  const ownerMedia  = media.filter(m => m.is_owner_post);
  const workerMedia = media.filter(m => !m.is_owner_post);
  const fmtSecs = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const mapUrl = mapCoords
    ? `https://www.openstreetmap.org/export/embed.html?mlat=${mapCoords.lat}&mlon=${mapCoords.lon}&zoom=16&layers=M`
    : null;

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
            {!isNew && canEdit && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-400 hover:bg-red-400/10 rounded-lg px-2 py-1 text-xs font-semibold"
              >
                {deleting ? '…' : 'Delete'}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 scroll-area overflow-y-auto px-5 py-4 space-y-5">

          {/* Title */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Job Title *</label>
            {canEdit ? (
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Roof repair at 42 Oak St"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
              />
            ) : (
              <p className="text-zinc-100 font-semibold">{title}</p>
            )}
          </div>

          {/* Date + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Date *</label>
              {canEdit ? (
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm text-zinc-100 focus:outline-none focus:border-amber-400/50"
                />
              ) : (
                <p className="text-zinc-100">{date ? format(parseISO(date), 'd MMM yyyy') : '—'}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">Status</label>
              {canEdit ? (
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm text-zinc-100 focus:outline-none focus:border-amber-400/50"
                >
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              ) : (
                <p className={`font-semibold capitalize ${STATUS_OPTIONS.find(s => s.value === status)?.color}`}>
                  {status.replace('_', ' ')}
                </p>
              )}
            </div>
          </div>

          {/* Location with autocomplete + map */}
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
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => selectSuggestion(s)}
                        className="w-full text-left px-3 py-2.5 text-xs text-zinc-200 hover:bg-zinc-700 border-b border-zinc-700/50 last:border-0 flex items-start gap-2"
                      >
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

            {/* Map embed */}
            {mapUrl && (
              <div className="mt-2 rounded-xl overflow-hidden border border-zinc-700" style={{ height: 160 }}>
                <iframe
                  title="Job location"
                  src={mapUrl}
                  width="100%"
                  height="160"
                  style={{ border: 0, display: 'block' }}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1.5">
              <FileText size={11} className="inline mr-1" />Notes / Instructions
            </label>
            {canEdit ? (
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the job, tools to bring, safety notes…"
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50 resize-none"
              />
            ) : (
              <p className="text-zinc-300 text-sm whitespace-pre-wrap">{description || '—'}</p>
            )}
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
                    <button
                      key={m.id}
                      onClick={() => canEdit && toggleAssign(m.user_id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                        assigned
                          ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                          : canEdit
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                      } ${!canEdit ? 'cursor-default' : ''}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold">{name[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-[10px] capitalize text-zinc-600">{m.role}</p>
                      </div>
                      {canEdit && (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          assigned ? 'border-amber-400 bg-amber-400' : 'border-zinc-600'
                        }`}>
                          {assigned && <span className="text-[10px] text-zinc-950 font-bold">✓</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Media — only on saved jobs */}
          {!isNew && (
            <>
              {/* Hidden file input — shared by owner + worker photo buttons */}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoChange}
              />

              {/* Boss posts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-widest">Boss Posts</label>
                  {isOwner && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/15 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        <Camera size={13} />
                        {uploading ? 'Uploading…' : 'Photo'}
                      </button>
                      <button
                        onClick={recording ? stopRecording : startRecording}
                        disabled={uploading}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-50 ${
                          recording
                            ? 'text-red-400 bg-red-400/15 animate-pulse'
                            : 'text-zinc-400 bg-zinc-800 hover:bg-zinc-700'
                        }`}
                      >
                        {recording ? <StopCircle size={13} /> : <Mic size={13} />}
                        {recording ? `Stop ${fmtSecs(recSecs)}` : 'Voice'}
                      </button>
                    </div>
                  )}
                </div>
                {mediaLoading ? (
                  <p className="text-xs text-zinc-600 py-2">Loading…</p>
                ) : ownerMedia.length === 0 ? (
                  <p className="text-xs text-zinc-600 py-2 italic">No posts yet</p>
                ) : (
                  <MediaGrid items={ownerMedia} onDelete={isOwner ? handleDeleteMedia : null} userId={user?.id} />
                )}
              </div>

              {/* Worker responses */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-widest">Worker Responses</label>
                  {!isOwner && (
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                    >
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
                  />
                )}
              </div>
            </>
          )}

          {isNew && (
            <p className="text-xs text-zinc-600 italic">Save the job first to add photos and voice memos.</p>
          )}

          <div className="h-2" />
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-bold rounded-2xl py-4"
            >
              {saving ? 'Saving…' : isNew ? 'Create Job' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaGrid({ items, onDelete, userId }) {
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
          {item.type === 'photo' && item.url && (
            <img
              src={item.url}
              alt={item.caption || 'Job photo'}
              className="w-full max-h-64 object-cover"
            />
          )}
          {item.type === 'voice' && item.url && (
            <div className="px-3 py-3 flex items-center gap-3">
              <Mic size={16} className="text-amber-400 shrink-0" />
              <audio controls src={item.url} className="flex-1 h-8" style={{ minWidth: 0 }} />
            </div>
          )}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="min-w-0">
              {item.caption && <p className="text-xs text-zinc-300 truncate">{item.caption}</p>}
              <p className="text-[10px] text-zinc-600">
                {item.profiles?.display_name || 'Unknown'} · {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
              </p>
            </div>
            {onDelete && (
              <button
                onClick={() => onDelete(item)}
                className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg ml-2 shrink-0"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
