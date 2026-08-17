-- STIMMA OS — 0001: organizacoes, usuarios, RBAC proprio
-- Ver docs/DATABASE.md e docs/SECURITY.md.

create extension if not exists pgcrypto;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table clinics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Espelha auth.users com o perfil interno do STIMMA OS. Mesmo padrao do
-- anamnese-app: novo usuario nasce inativo, ativacao e manual.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  full_name text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null, -- ex: admin, professional, reception, clinical_support, spa
  label text not null,
  unique (organization_id, key)
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- ex: alerts.view, tasks.assign, financial.approve
  label text not null,
  description text
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table user_roles (
  user_id uuid not null references profiles(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  full_name text not null,
  sd_professional_id text, -- external_id no Simples Dental, quando conhecido
  created_at timestamptz not null default now()
);

-- Trigger: todo novo usuario Supabase Auth ganha um profile inativo.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), false);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

alter table organizations enable row level security;
alter table clinics enable row level security;
alter table profiles enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table user_roles enable row level security;
alter table professionals enable row level security;

-- Helper: usuario autenticado e ativo pertence a qual organizacao.
create function current_profile_org()
returns uuid
language sql stable security definer set search_path = public
as $$
  select organization_id from profiles where id = auth.uid() and active = true;
$$;

create policy "profiles: self read" on profiles
  for select using (id = auth.uid());

create policy "org tables: read within org" on organizations
  for select using (id = current_profile_org());

create policy "clinics: read within org" on clinics
  for select using (organization_id = current_profile_org());

create policy "roles: read within org" on roles
  for select using (organization_id = current_profile_org());

create policy "permissions: read all authenticated" on permissions
  for select using (auth.role() = 'authenticated');

create policy "professionals: read within org" on professionals
  for select using (organization_id = current_profile_org());
