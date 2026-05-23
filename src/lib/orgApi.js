import { supabase } from './supabase';

// ── Auth ──────────────────────────────────────────────────────

export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email,
      display_name: displayName,
    });
  }
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ── Organisations ─────────────────────────────────────────────

export async function createOrg(name) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: org, error } = await supabase
    .from('organisations')
    .insert({ name, owner_id: user.id })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('org_members').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
    display_name: user.user_metadata?.display_name || user.email,
  });

  return org;
}

export async function getMyOrg() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Two separate queries — embedded joins can silently return null when
  // the joined table's RLS policy isn't satisfied yet.
  const { data: member, error: memberErr } = await supabase
    .from('org_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberErr || !member) return null;

  const { data: org, error: orgErr } = await supabase
    .from('organisations')
    .select('*')
    .eq('id', member.org_id)
    .single();

  if (orgErr || !org) return null;
  return { org, role: member.role };
}

export async function getOrgByInviteCode(code) {
  const { data, error } = await supabase
    .from('organisations')
    .select('id, name, invite_code, owner_id, created_at')
    .eq('invite_code', code.toUpperCase())
    .maybeSingle();
  if (error || !data)
    throw new Error('Organisation not found — check your invite code');
  return data;
}

export async function joinOrg(orgId, role = 'employee') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('org_members').insert({
    org_id: orgId,
    user_id: user.id,
    role,
    display_name: user.user_metadata?.display_name || user.email,
  });
  if (error) throw error;
}

export async function getOrgMembers(orgId) {
  const { data, error } = await supabase
    .from('org_members')
    .select('*')
    .eq('org_id', orgId)
    .order('joined_at');
  if (error) throw error;
  return data || [];
}

export async function removeMember(orgId, userId) {
  const { error } = await supabase
    .from('org_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function updateMemberRole(orgId, userId, role) {
  const { error, count } = await supabase
    .from('org_members')
    .update({ role }, { count: 'exact' })
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error) throw error;
  if (count === 0) throw new Error('Permission denied — add the UPDATE policy for org_members in Supabase');
}

// ── Jobs ──────────────────────────────────────────────────────

export async function getJobsForMonth(orgId, year, month) {
  const start   = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-indexed; day 0 = last day of prev month
  const end     = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('jobs')
    .select('*, job_assignments(user_id)')
    .eq('org_id', orgId)
    .gte('date', start)
    .lte('date', end)
    .order('date');
  if (error) throw error;
  return data ?? [];
}

export async function getJob(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .select(`*, job_assignments(user_id, profiles(display_name, email))`)
    .eq('id', jobId)
    .single();
  if (error) throw error;
  return data;
}

export async function createJob(orgId, { title, description, date, location, assignedUserIds = [], seriesId, color }) {
  const { data: { user } } = await supabase.auth.getUser();

  const row = { org_id: orgId, title, description, date, location, created_by: user.id };
  if (seriesId) row.series_id = seriesId;
  if (color)    row.color     = color;

  const { data: job, error } = await supabase
    .from('jobs')
    .insert(row)
    .select()
    .single();
  if (error) throw error;

  if (assignedUserIds.length > 0) {
    await supabase.from('job_assignments').insert(
      assignedUserIds.map(uid => ({ job_id: job.id, user_id: uid }))
    );
  }
  return job;
}

export async function updateJobDescription(jobId, description) {
  const { error } = await supabase
    .from('jobs')
    .update({ description })
    .eq('id', jobId);
  if (error) throw error;
}

export async function updateJobSeries(seriesId, { title, description, location, status, color, assignedUserIds }) {
  const update = {};
  if (title !== undefined)       update.title       = title;
  if (description !== undefined) update.description = description;
  if (location !== undefined)    update.location    = location;
  if (status !== undefined)      update.status      = status;
  if (color !== undefined)       update.color       = color;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from('jobs').update(update).eq('series_id', seriesId);
    if (error) throw error;
  }

  if (assignedUserIds !== undefined) {
    const { data: seriesJobs } = await supabase.from('jobs').select('id').eq('series_id', seriesId);
    for (const j of (seriesJobs || [])) {
      const { data: existing } = await supabase.from('job_assignments').select('user_id').eq('job_id', j.id);
      const existingIds = (existing || []).map(a => a.user_id);
      const toAdd    = assignedUserIds.filter(uid => !existingIds.includes(uid));
      const toRemove = existingIds.filter(uid => !assignedUserIds.includes(uid));
      if (toRemove.length > 0) await supabase.from('job_assignments').delete().eq('job_id', j.id).in('user_id', toRemove);
      if (toAdd.length > 0)    await supabase.from('job_assignments').insert(toAdd.map(uid => ({ job_id: j.id, user_id: uid })));
    }
  }
}

export async function updateJob(jobId, { title, description, date, location, status, color, assignedUserIds }) {
  const update = { title, description, date, location, status };
  if (color !== undefined) update.color = color;
  const { error } = await supabase
    .from('jobs')
    .update(update)
    .eq('id', jobId);
  if (error) throw error;

  if (assignedUserIds !== undefined) {
    const { data: existing } = await supabase.from('job_assignments').select('user_id').eq('job_id', jobId);
    const existingIds = (existing || []).map(a => a.user_id);
    const toAdd    = assignedUserIds.filter(uid => !existingIds.includes(uid));
    const toRemove = existingIds.filter(uid => !assignedUserIds.includes(uid));
    if (toRemove.length > 0) await supabase.from('job_assignments').delete().eq('job_id', jobId).in('user_id', toRemove);
    if (toAdd.length > 0)    await supabase.from('job_assignments').insert(toAdd.map(uid => ({ job_id: jobId, user_id: uid })));
  }
}

export async function getSeriesJobIds(seriesId) {
  const { data, error } = await supabase.from('jobs').select('id').eq('series_id', seriesId);
  if (error) throw error;
  return (data || []).map(j => j.id);
}

export async function deleteJob(jobId) {
  const { error } = await supabase.from('jobs').delete().eq('id', jobId);
  if (error) throw error;
}

export async function deleteJobSeries(seriesId) {
  const { error } = await supabase.from('jobs').delete().eq('series_id', seriesId);
  if (error) throw error;
}

export async function updateJobStatus(jobId, status) {
  const { error } = await supabase
    .from('jobs')
    .update({ status })
    .eq('id', jobId);
  if (error) throw error;
}

// ── Org notes ─────────────────────────────────────────────────

export async function getOrgNotes(orgId) {
  const { data, error } = await supabase
    .from('org_notes')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createOrgNote(orgId, title, content, visibility = 'everyone', editableBy = 'everyone', visibilityUsers = [], editableUsers = []) {
  const { data: { user } } = await supabase.auth.getUser();
  const displayName = user.user_metadata?.display_name || user.email;
  const { data, error } = await supabase
    .from('org_notes')
    .insert({
      org_id: orgId,
      title: title || 'Untitled Note',
      content,
      visibility,
      editable_by: editableBy,
      visibility_users: visibilityUsers,
      editable_users: editableUsers,
      created_by: user.id,
      created_by_name: displayName,
      updated_by: user.id,
      updated_by_name: displayName,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOrgNote(noteId, title, content, visibility, editableBy, visibilityUsers, editableUsers) {
  const { data: { user } } = await supabase.auth.getUser();
  const displayName = user.user_metadata?.display_name || user.email;
  const update = {
    title,
    content,
    updated_by: user.id,
    updated_by_name: displayName,
    updated_at: new Date().toISOString(),
  };
  if (visibility !== undefined)      update.visibility       = visibility;
  if (editableBy !== undefined)      update.editable_by      = editableBy;
  if (visibilityUsers !== undefined) update.visibility_users = visibilityUsers;
  if (editableUsers !== undefined)   update.editable_users   = editableUsers;
  const { error } = await supabase.from('org_notes').update(update).eq('id', noteId);
  if (error) throw error;
}

export async function deleteOrgNote(noteId) {
  const { error } = await supabase.from('org_notes').delete().eq('id', noteId);
  if (error) throw error;
}

// ── Job media ─────────────────────────────────────────────────

export async function getJobMedia(jobId) {
  const { data, error } = await supabase
    .from('job_media')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at');
  if (error) throw error;

  return Promise.all(data.map(async (item) => {
    const { data: urlData } = await supabase.storage
      .from('job-media')
      .createSignedUrl(item.storage_path, 3600);
    return { ...item, url: urlData?.signedUrl || null };
  }));
}

export async function uploadJobMedia(jobId, file, type, caption = '', isOwnerPost = false) {
  const { data: { user } } = await supabase.auth.getUser();
  const ext = file.name?.split('.').pop() || (type === 'voice' ? 'webm' : 'jpg');
  const path = `${jobId}/${user.id}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('job-media')
    .upload(path, file);
  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const { error: dbError } = await supabase.from('job_media').insert({
    job_id: jobId,
    uploaded_by: user.id,
    type,
    storage_path: path,
    caption,
    is_owner_post: isOwnerPost,
  });
  if (dbError) {
    // Remove the uploaded file if the DB insert failed
    await supabase.storage.from('job-media').remove([path]);
    throw new Error(`Database: ${dbError.message}`);
  }
}

export async function deleteJobMedia(mediaId, storagePath) {
  await supabase.storage.from('job-media').remove([storagePath]);
  const { error } = await supabase.from('job_media').delete().eq('id', mediaId);
  if (error) throw error;
}

// ── Invoice submissions ───────────────────────────────────────

export async function submitInvoice(orgId, invoiceData) {
  const { data: { user } } = await supabase.auth.getUser();
  const displayName = user.user_metadata?.display_name || user.email;

  const { error } = await supabase.from('invoice_submissions').insert({
    org_id: orgId,
    submitted_by: user.id,
    display_name: displayName,
    invoice_data: invoiceData,
  });
  if (error) throw error;
}

export async function getMySubmissions(orgId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('invoice_submissions')
    .select('*')
    .eq('org_id', orgId)
    .eq('submitted_by', user.id)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getOrgSubmissions(orgId) {
  const { data, error } = await supabase
    .from('invoice_submissions')
    .select('*')
    .eq('org_id', orgId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ── Job check-ins ─────────────────────────────────────────────

export async function getJobCheckIns(jobId) {
  const { data, error } = await supabase
    .from('job_check_ins')
    .select('*')
    .eq('job_id', jobId);
  if (error) throw error;
  return data || [];
}

export async function checkInToJob(jobId, orgId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('job_check_ins').upsert({
    job_id: jobId,
    user_id: user.id,
    org_id: orgId,
    checked_in_at: new Date().toISOString(),
    checked_out_at: null,
  }, { onConflict: 'job_id,user_id' });
  if (error) throw error;
}

export async function checkOutFromJob(jobId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('job_check_ins')
    .update({ checked_out_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('user_id', user.id);
  if (error) throw error;
}

export async function updateSubmissionStatus(submissionId, status, notes = '') {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('invoice_submissions')
    .update({ status, notes, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq('id', submissionId);
  if (error) throw error;
}
