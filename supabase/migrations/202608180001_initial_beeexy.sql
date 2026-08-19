create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  birth_date date,
  sex_at_birth text check (sex_at_birth in ('female','male','prefer_not_to_say')),
  phone text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dependents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  relationship text not null,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  sex_at_birth text not null check (sex_at_birth in ('female','male','prefer_not_to_say')),
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pre_triage_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dependent_id uuid references public.dependents(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','completed')),
  current_step integer not null default 0 check (current_step between 0 and 7),
  answers jsonb not null default '{}'::jsonb,
  result jsonb,
  result_source text check (result_source in ('demo_fixture','team_clinical_service')),
  fixture_version text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.doctors (
  id uuid primary key,
  name text not null,
  initials text not null,
  specialty text not null,
  bio text not null,
  rating numeric(2,1) not null,
  review_count integer not null default 0,
  distance_miles numeric(5,1) not null,
  languages text[] not null default '{}',
  insurances text[] not null default '{}',
  location_name text not null,
  address text not null,
  board_certified boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.doctor_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  starts_at timestamptz not null,
  modality text not null check (modality in ('in_person','video')),
  clinic_time_zone text not null default 'America/New_York',
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dependent_id uuid references public.dependents(id) on delete set null,
  doctor_id uuid not null references public.doctors(id),
  doctor_slot_id uuid not null references public.doctor_slots(id),
  reason text,
  modality text not null check (modality in ('in_person','video')),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed')),
  reminder_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index appointments_active_slot_unique
  on public.appointments(doctor_slot_id)
  where status <> 'cancelled';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  reference_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  language text not null default 'en',
  appointment_notifications boolean not null default true,
  assessment_notifications boolean not null default true,
  install_prompt_dismissed boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, first_name, last_name)
  values (new.id, new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name')
  on conflict (id) do nothing;
  insert into public.user_preferences(user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.dependents enable row level security;
alter table public.pre_triage_sessions enable row level security;
alter table public.doctors enable row level security;
alter table public.doctor_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;
alter table public.user_preferences enable row level security;

create policy "profiles own row" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "dependents owned" on public.dependents for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "pretriage owned" on public.pre_triage_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid() and (dependent_id is null or exists (select 1 from public.dependents d where d.id = dependent_id and d.owner_user_id = auth.uid())));
create policy "doctors public read" on public.doctors for select using (published = true);
create policy "slots public read" on public.doctor_slots for select using (published = true and starts_at > now());
create policy "appointments owned read" on public.appointments for select using (user_id = auth.uid());
create policy "appointments owned insert" on public.appointments for insert with check (user_id = auth.uid() and (dependent_id is null or exists (select 1 from public.dependents d where d.id = dependent_id and d.owner_user_id = auth.uid())));
create policy "appointments owned update" on public.appointments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications owned" on public.notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "preferences owned" on public.user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create view public.available_doctor_slots with (security_invoker = true) as
select s.* from public.doctor_slots s
where s.published = true and s.starts_at > now()
and not exists (
  select 1 from public.appointments a
  where a.doctor_slot_id = s.id and a.status <> 'cancelled'
);

insert into public.doctors(id,name,initials,specialty,bio,rating,review_count,distance_miles,languages,insurances,location_name,address,board_certified,published) values
('11111111-1111-4111-8111-111111111111','Dr. Robert Chen','RC','Neurology','Board-certified neurologist focused on headaches and migraine care.',4.9,198,1.1,array['English','Mandarin'],array['Aetna','BlueCross BlueShield','Cigna'],'NYU Langone Health','550 First Avenue, New York, NY',true,true),
('22222222-2222-4222-8222-222222222222','Dr. Sarah Patel','SP','Neurology','Neurologist providing in-person and virtual consultations.',4.8,142,3.4,array['English','Hindi'],array['Aetna','UnitedHealthcare','Medicare'],'Weill Cornell Medicine','1305 York Avenue, New York, NY',true,true),
('33333333-3333-4333-8333-333333333333','Dr. James Morales','JM','Primary Care','Primary care physician focused on accessible preventive care.',4.7,89,2.1,array['English','Spanish'],array['Cigna','UnitedHealthcare','Medicaid'],'Mount Sinai','1 Gustave L. Levy Place, New York, NY',true,true)
on conflict (id) do update set published = excluded.published;

insert into public.doctor_slots(doctor_id,starts_at,modality) values
('11111111-1111-4111-8111-111111111111', date_trunc('day', now()) + interval '1 day 14 hours 30 minutes','in_person'),
('11111111-1111-4111-8111-111111111111', date_trunc('day', now()) + interval '2 days 19 hours','video'),
('22222222-2222-4222-8222-222222222222', date_trunc('day', now()) + interval '2 days 14 hours 30 minutes','in_person'),
('22222222-2222-4222-8222-222222222222', date_trunc('day', now()) + interval '3 days 19 hours','video'),
('33333333-3333-4333-8333-333333333333', date_trunc('day', now()) + interval '1 day 16 hours','in_person'),
('33333333-3333-4333-8333-333333333333', date_trunc('day', now()) + interval '4 days 18 hours','video');
