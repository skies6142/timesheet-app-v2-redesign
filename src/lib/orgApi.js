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
    .select('*')
    .eq('invite_code', code.toUpperCase())
    .single();
  if (error) throw new Error('Organisation not found — check your invite code');
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
    .select('*, profiles(display_name, email)')
    .eq('org_id', orgId)
    .order('joined_at');
  if (error) { console.error('[getOrgMembers]', error); return []; }
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

// ── Jobs ──────────────────────────────────────────────────────

export async function getJobsForMonth(orgId, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end   = `${year}-${String(month).padStart(2, '0')}-31`;

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
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

export async function createJob(orgId, { title, description, date, location, assignedUserIds = [] }) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({ org_id: orgId, title, description, date, location, created_by: user.id })
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

export async function updateJob(jobId, { title, description, date, location, status, assignedUserIds }) {
  const { error } = await supabase
    .from('jobs')
    .update({ title, description, date, location, status })
    .eq('id', jobId);
  if (error) throw error;

  if (assignedUserIds !== undefined) {
    await supabase.from('job_assignments').delete().eq('job_id', jobId);
    if (assignedUserIds.length > 0) {
      await supabase.from('job_assignments').insert(
        assignedUserIds.map(uid => ({ job_id: jobId, user_id: uid }))
      );
    }
  }
}

export async function deleteJob(jobId) {
  const { error } = await supabase.from('jobs').delete().eq('id', jobId);
  if (error) throw error;
}

// ── Job media ─────────────────────────────────────────────────

export async function getJobMedia(jobId) {
  const { data, error } = await supabase
    .from('job_media')
    .select('*, profiles(display_name)')
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
  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase.from('job_media').insert({
    job_id: jobId,
    uploaded_by: user.id,
    type,
    storage_path: path,
    caption,
    is_owner_post: isOwnerPost,
  });
  if (dbError) throw dbError;
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

export async function updateSubmissionStatus(submissionId, status, notes = '') {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('invoice_submissions')
    .update({ status, notes, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq('id', submissionId);
  if (error) throw error;
}
