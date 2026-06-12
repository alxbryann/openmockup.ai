-- ============================================================
-- Supabase Storage: project-media + render-results buckets
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  false,
  104857600,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'render-results',
  'render-results',
  false,
  524288000,
  array['application/zip', 'image/png']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- project-media: owner full access on their prefix {user_id}/
create policy "Users upload own project media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users select own project media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update own project media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own project media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read for media belonging to public projects (embed/gallery)
create policy "Anyone can read media for public projects"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'project-media'
    and exists (
      select 1 from public.projects p
      where p.is_public = true
        and p.id::text = (storage.foldername(name))[2]
    )
  );

-- render-results: owner access
create policy "Users upload own render results"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'render-results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users select own render results"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'render-results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own render results"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'render-results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- render_jobs — async batch export queue
-- ============================================================
create table public.render_jobs (
  id              uuid        default gen_random_uuid() primary key,
  user_id         uuid        references auth.users(id) on delete cascade not null,
  status          text        not null default 'queued'
                              check (status in ('queued', 'running', 'done', 'failed')),
  progress        integer     not null default 0 check (progress >= 0 and progress <= 100),
  total_items     integer     not null default 0,
  result_path     text,
  error_message   text,
  payload         jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index render_jobs_user_id_idx on public.render_jobs (user_id);
create index render_jobs_status_idx on public.render_jobs (status);

alter table public.render_jobs enable row level security;

create policy "Users can view own render jobs"
  on public.render_jobs for select
  using (auth.uid() = user_id);

create policy "Users can create own render jobs"
  on public.render_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own render jobs"
  on public.render_jobs for update
  using (auth.uid() = user_id);

create trigger set_render_jobs_updated_at
  before update on public.render_jobs
  for each row execute procedure public.handle_updated_at();
