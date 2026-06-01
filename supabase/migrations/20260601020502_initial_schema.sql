-- ============================================================
-- profiles — auto-created on signup, linked to auth.users
-- ============================================================
create table public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  email      text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-insert profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- projects — one row per mockup project
-- snapshot JSONB mirrors ProjectSnapshot from projectStore.ts:
--   { devices[], bgColor, uiTheme, cameraRoll, orbitDistance,
--     autoRotate, cameraPosition, cameraTarget,
--     viewportAspect, viewportInsetRight }
-- ============================================================
create table public.projects (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references auth.users(id) on delete cascade not null,
  name       text        not null default 'Untitled mockup',
  is_public  boolean     not null default false,
  thumbnail  text,                  -- low-res JPEG data URL
  snapshot   jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index projects_user_id_idx    on public.projects (user_id);
create index projects_updated_at_idx on public.projects (updated_at desc);
create index projects_is_public_idx  on public.projects (is_public) where is_public = true;

alter table public.projects enable row level security;

-- Owners see their own projects
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

-- Anyone (including anonymous) can view public projects
create policy "Anyone can view public projects"
  on public.projects for select
  using (is_public = true);

create policy "Users can create their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at on every write
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute procedure public.handle_updated_at();
