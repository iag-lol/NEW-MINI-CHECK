-- ========================================
--  Supabase schema for New Mini-Check
-- ========================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------- BASE TABLES ----------

create table if not exists public.flota (
  id uuid primary key default uuid_generate_v4(),
  ppu text unique not null,
  numero_interno text unique not null,
  marca text not null,
  modelo text not null,
  anio int not null check (anio >= 2000),
  terminal text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.usuarios (
  rut text primary key,
  nombre text not null,
  cargo text not null check (cargo in ('INSPECTOR','SUPERVISOR')),
  terminal text not null,
  password text not null,
  foto_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.revisiones (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  inspector_rut text not null references public.usuarios(rut),
  inspector_nombre text not null,
  terminal_detectado text not null,
  terminal_reportado text not null,
  bus_ppu text not null,
  bus_interno text not null,
  estado_bus text not null check (estado_bus in ('OPERATIVO','EN_PANNE')),
  lat double precision not null,
  lon double precision not null,
  observaciones text,
  semana_iso text not null,
  operativo boolean not null
);

create table if not exists public.tags (
  id uuid primary key default uuid_generate_v4(),
  revision_id uuid not null references public.revisiones(id) on delete cascade,
  tiene boolean not null,
  serie text,
  observacion text,
  bus_ppu text not null,
  terminal text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.camaras (
  id uuid primary key default uuid_generate_v4(),
  revision_id uuid not null references public.revisiones(id) on delete cascade,
  monitor_estado text not null check (monitor_estado in ('FUNCIONA','APAGADO','CON_DANO','SIN_SENAL')),
  detalle jsonb,
  observacion text,
  bus_ppu text not null,
  terminal text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.extintores (
  id uuid primary key default uuid_generate_v4(),
  revision_id uuid not null references public.revisiones(id) on delete cascade,
  tiene boolean not null,
  vencimiento_mes int,
  vencimiento_anio int,
  certificacion text check (certificacion in ('VIGENTE','VENCIDA')),
  sonda text check (sonda in ('OK','SIN_LECTURA','FUERA_DE_RANGO')),
  manometro text check (manometro in ('OK','SIN_LECTURA','FUERA_DE_RANGO')),
  presion text check (presion in ('SOBRECARGA','OPTIMO','BAJA_CARGA')),
  cilindro text check (cilindro in ('OK','ABOLLADO','OXIDADO')),
  porta text check (porta in ('TIENE','NO_TIENE','DANADO')),
  observacion text,
  bus_ppu text not null,
  terminal text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mobileye (
  id uuid primary key default uuid_generate_v4(),
  revision_id uuid not null references public.revisiones(id) on delete cascade,
  bus_marca text not null,
  alerta_izq boolean,
  alerta_der boolean,
  consola boolean,
  sensor_frontal boolean,
  sensor_izq boolean,
  sensor_der boolean,
  observacion text,
  bus_ppu text not null,
  terminal text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.odometro (
  id uuid primary key default uuid_generate_v4(),
  revision_id uuid not null references public.revisiones(id) on delete cascade,
  lectura double precision not null,
  estado text not null check (estado in ('OK','INCONSISTENTE','NO_FUNCIONA')),
  observacion text,
  bus_ppu text not null,
  terminal text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.publicidad (
  id uuid primary key default uuid_generate_v4(),
  revision_id uuid not null references public.revisiones(id) on delete cascade,
  tiene boolean not null,
  danio boolean,
  residuos boolean,
  detalle_lados jsonb,
  nombre_publicidad text,
  observacion text,
  bus_ppu text not null,
  terminal text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default uuid_generate_v4(),
  modulo text not null,
  revision_id uuid not null references public.revisiones(id) on delete cascade,
  estado text not null check (estado in ('PENDIENTE','EN_PROCESO','RESUELTO')),
  prioridad text not null check (prioridad in ('ALTA','MEDIA','BAJA')),
  descripcion text not null,
  terminal text not null,
  created_at timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.personal (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  cargo text not null,
  terminal text not null,
  telefono text,
  correo text,
  estado text not null check (estado in ('DISPONIBLE','LICENCIA','TURNO')),
  created_at timestamptz not null default now()
);

-- ---------- INDEXES ----------

create index if not exists idx_revisiones_bus on public.revisiones(bus_ppu);
create index if not exists idx_tickets_estado on public.tickets(estado);
create index if not exists idx_tags_revision on public.tags(revision_id);

-- ---------- ROW LEVEL SECURITY ----------

alter table public.flota enable row level security;
alter table public.usuarios enable row level security;
alter table public.revisiones enable row level security;
alter table public.tags enable row level security;
alter table public.camaras enable row level security;
alter table public.extintores enable row level security;
alter table public.mobileye enable row level security;
alter table public.odometro enable row level security;
alter table public.publicidad enable row level security;
alter table public.tickets enable row level security;
alter table public.personal enable row level security;

create policy if not exists "public_read_usuarios" on public.usuarios for select using (true);
create policy if not exists "public_read_flota" on public.flota for select using (true);
create policy if not exists "crud_revisiones" on public.revisiones for all using (true) with check (true);
create policy if not exists "crud_tags" on public.tags for all using (true) with check (true);
create policy if not exists "crud_camaras" on public.camaras for all using (true) with check (true);
create policy if not exists "crud_extintores" on public.extintores for all using (true) with check (true);
create policy if not exists "crud_mobileye" on public.mobileye for all using (true) with check (true);
create policy if not exists "crud_odometro" on public.odometro for all using (true) with check (true);
create policy if not exists "crud_publicidad" on public.publicidad for all using (true) with check (true);
create policy if not exists "crud_tickets" on public.tickets for all using (true) with check (true);
create policy if not exists "public_read_personal" on public.personal for select using (true);

-- ---------- SEED DATA ----------

insert into public.flota (ppu, numero_interno, marca, modelo, anio, terminal)
values
  ('SHRS75','BUS-101','VOLVO','B450R',2019,'El Roble'),
  ('WXYZ12','BUS-202','SCANIA','K400',2020,'La Reina')
on conflict (ppu) do nothing;

insert into public.usuarios (rut, nombre, cargo, terminal, password, foto_url)
values (
  '12.345.678-5',
  'María Torres',
  'SUPERVISOR',
  'El Roble',
  crypt('Supervisor#2025', gen_salt('bf')),
  null
)
on conflict (rut) do update
set nombre = excluded.nombre,
    cargo = excluded.cargo,
    terminal = excluded.terminal,
    password = excluded.password,
    foto_url = excluded.foto_url;
