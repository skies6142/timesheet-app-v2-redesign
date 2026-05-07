-- ============================================================
-- TimeSheet Org Schema
-- Run this in the Supabase SQL editor for a fresh project.
-- After running, also create a Storage bucket named "job-media"
-- (Dashboard → Storage → New bucket → job-media, Public: OFF)
-- ============================================================

-- ── Invite code generator ────────────────────────────────────
create or replace function generate_invite_code() returns text as $$
declare
  chars text := 'ABCDEFGHJKMNPQRTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$$ language plpgsql;

-- ── Profiles (extends auth.users) ───────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  email         text,
  created_at    timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Organisations ────────────────────────────────────────────
create table public.organisations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  owner_id     uuid references auth.users(id) not null,
  invite_code  text unique not null default generate_invite_code(),
  created_at   timestamptz default now()
);

-- ── Org members ──────────────────────────────────────────────
create table public.org_members (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organisations(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  role          text not null check (role in ('owner', 'employee', 'subcontractor')) default 'employee',
  display_name  text,
  joined_at     timestamptz default now(),
  unique(org_id, user_id)
);

-- ── Jobs ─────────────────────────────────────────────────────
create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organisations(id) on delete cascade not null,
  title        text not null,
  description  text,
  date         date not null,
  location     text,
  status       text not null check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')) default 'scheduled',
  created_by   uuid references auth.users(id),
  created_at   timestamptz default now()
);

-- ── Job assignments ──────────────────────────────────────────
create table public.job_assignments (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references public.jobs(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  unique(job_id, user_id)
);

-- ── Job media ────────────────────────────────────────────────
create table public.job_media (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid references public.jobs(id) on delete cascade not null,
  uploaded_by    uuid references auth.users(id) not null,
  type           text not null check (type in ('photo', 'voice')),
  storage_path   text not null,
  caption        text,
  is_owner_post  boolean default false,
  created_at     timestamptz default now()
);

-- ── Invoice submissions ──────────────────────────────────────
create table public.invoice_submissions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references public.organisations(id) on delete cascade not null,
  submitted_by   uuid references auth.users(id) not null,
  display_name   text,
  invoice_data   jsonb not null,
  status         text not null check (status in ('pending', 'approved', 'paid', 'rejected')) default 'pending',
  notes          text,
  submitted_at   timestamptz default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users(id)
);

-- ── Enable RLS ───────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.org_members enable row level security;
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.job_media enable row level security;
alter table public.invoice_submissions enable row level security;

-- ── RLS: profiles ────────────────────────────────────────────
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid());

-- ── RLS: organisations ───────────────────────────────────────
create policy "orgs_select_member" on public.organisations for select
  using (
    owner_id = auth.uid() or
    exists (select 1 from public.org_members m where m.org_id = organisations.id and m.user_id = auth.uid())
  );
create policy "orgs_insert_own" on public.organisations for insert with check (owner_id = auth.uid());
create policy "orgs_update_owner" on public.organisations for update using (owner_id = auth.uid());
create policy "orgs_delete_owner" on public.organisations for delete using (owner_id = auth.uid());

-- ── RLS: org_members ─────────────────────────────────────────
create policy "members_select_same_org" on public.org_members for select
  using (
    exists (select 1 from public.org_members m2 where m2.org_id = org_members.org_id and m2.user_id = auth.uid())
  );
create policy "members_insert_self" on public.org_members for insert with check (user_id = auth.uid());
create policy "members_delete_self_or_owner" on public.org_members for delete
  using (
    user_id = auth.uid() or
    exists (select 1 from public.organisations o where o.id = org_id and o.owner_id = auth.uid())
  );

-- ── RLS: jobs ────────────────────────────────────────────────
create policy "jobs_select_member" on public.jobs for select
  using (exists (select 1 from public.org_members m where m.org_id = jobs.org_id and m.user_id = auth.uid()));
create policy "jobs_insert_owner" on public.jobs for insert
  with check (exists (select 1 from public.organisations o where o.id = org_id and o.owner_id = auth.uid()));
create policy "jobs_update_owner" on public.jobs for update
  using (exists (select 1 from public.organisations o where o.id = org_id and o.owner_id = auth.uid()));
create policy "jobs_delete_owner" on public.jobs for delete
  using (exists (select 1 from public.organisations o where o.id = org_id and o.owner_id = auth.uid()));

-- ── RLS: job_assignments ─────────────────────────────────────
create policy "assignments_select_member" on public.job_assignments for select
  using (exists (
    select 1 from public.jobs j
    join public.org_members m on m.org_id = j.org_id
    where j.id = job_assignments.job_id and m.user_id = auth.uid()
  ));
create policy "assignments_insert_owner" on public.job_assignments for insert
  with check (exists (
    select 1 from public.jobs j
    join public.organisations o on o.id = j.org_id
    where j.id = job_id and o.owner_id = auth.uid()
  ));
create policy "assignments_delete_owner" on public.job_assignments for delete
  using (exists (
    select 1 from public.jobs j
    join public.organisations o on o.id = j.org_id
    where j.id = job_assignments.job_id and o.owner_id = auth.uid()
  ));

-- ── RLS: job_media ───────────────────────────────────────────
create policy "media_select_member" on public.job_media for select
  using (exists (
    select 1 from public.jobs j
    join public.org_members m on m.org_id = j.org_id
    where j.id = job_media.job_id and m.user_id = auth.uid()
  ));
create policy "media_insert_member" on public.job_media for insert
  with check (
    uploaded_by = auth.uid() and
    exists (
      select 1 from public.jobs j
      join public.org_members m on m.org_id = j.org_id
      where j.id = job_id and m.user_id = auth.uid()
    )
  );
create policy "media_delete_uploader_or_owner" on public.job_media for delete
  using (
    uploaded_by = auth.uid() or
    exists (
      select 1 from public.jobs j
      join public.organisations o on o.id = j.org_id
      where j.id = job_media.job_id and o.owner_id = auth.uid()
    )
  );

-- ── RLS: invoice_submissions ─────────────────────────────────
create policy "inv_select_own_or_org_owner" on public.invoice_submissions for select
  using (
    submitted_by = auth.uid() or
    exists (select 1 from public.organisations o where o.id = org_id and o.owner_id = auth.uid())
  );
create policy "inv_insert_member" on public.invoice_submissions for insert
  with check (
    submitted_by = auth.uid() and
    exists (select 1 from public.org_members m where m.org_id = org_id and m.user_id = auth.uid())
  );
create policy "inv_update_org_owner" on public.invoice_submissions for update
  using (exists (select 1 from public.organisations o where o.id = org_id and o.owner_id = auth.uid()));

-- ── Storage policies (run after creating the bucket) ─────────
-- In the Supabase dashboard: Storage → job-media bucket → Policies
-- Or run these after the bucket exists:

-- insert into storage.buckets (id, name, public) values ('job-media', 'job-media', false);

-- create policy "media_upload_member" on storage.objects for insert
--   with check (bucket_id = 'job-media' and auth.uid() is not null);

-- create policy "media_read_member" on storage.objects for select
--   using (bucket_id = 'job-media' and auth.uid() is not null);

-- create policy "media_delete_uploader" on storage.objects for delete
--   using (bucket_id = 'job-media' and auth.uid()::text = (storage.foldername(name))[1]);
