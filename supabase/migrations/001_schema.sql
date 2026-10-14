-- Smart Calorie Tracker — schema, constraints, triggers and Row Level Security.
-- Run in Supabase Dashboard > SQL Editor (or `supabase db push`). Idempotent where practical.

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- foods
create table if not exists public.foods (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name    text not null,
  synonyms           text[] not null default '{}',
  calories           numeric(8,2) not null check (calories >= 0 and calories <= 10000),
  protein            numeric(8,2) check (protein is null or protein >= 0),
  carbohydrates      numeric(8,2) check (carbohydrates is null or carbohydrates >= 0),
  fat                numeric(8,2) check (fat is null or fat >= 0),
  fiber              numeric(8,2) check (fiber is null or fiber >= 0),
  sugar              numeric(8,2) check (sugar is null or sugar >= 0),
  -- The nutrient values above are for `reference_quantity` `reference_unit`
  -- (e.g. 100 g, 100 ml, 1 piece, 1 serving).
  reference_quantity numeric(8,2) not null default 100 check (reference_quantity > 0),
  reference_unit     text not null default 'g' check (reference_unit in ('g','ml','piece','serving')),
  -- Weight/volume of ONE piece or serving (used to convert pieces <-> g/ml).
  serving_size       numeric(8,2) check (serving_size is null or serving_size > 0),
  serving_unit       text check (serving_unit is null or serving_unit in ('g','ml')),
  barcode            text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  image_url          text check (image_url is null or image_url ~* '^https?://'),
  use_count          integer not null default 0,
  last_used_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint foods_serving_pair check ((serving_size is null) = (serving_unit is null)),
  constraint foods_serving_unit_matches check (
    serving_unit is null or reference_unit in ('piece','serving') or serving_unit = reference_unit
  )
);

-- One barcode per user (duplicates are rejected by the database itself).
create unique index if not exists foods_user_barcode_uq on public.foods (user_id, barcode) where barcode is not null;
create index if not exists foods_user_name_idx on public.foods (user_id, normalized_name);
create index if not exists foods_synonyms_gin on public.foods using gin (synonyms);

-- updated_at changes only for real edits, not for usage counters.
create or replace function public.foods_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'use_count' - 'last_used_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'use_count' - 'last_used_at' - 'updated_at') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

drop trigger if exists foods_touch on public.foods;
create trigger foods_touch before update on public.foods
  for each row execute function public.foods_touch();

-- ---------------------------------------------------------------- food_logs
create table if not exists public.food_logs (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- ON DELETE SET NULL: deleting a food never deletes history, and the snapshot survives.
  food_id              uuid references public.foods(id) on delete set null,
  food_name_snapshot   text not null check (char_length(btrim(food_name_snapshot)) > 0),
  -- Snapshots hold the TOTAL nutrients of what was eaten (already scaled by quantity).
  calories_snapshot    numeric(9,2) not null check (calories_snapshot >= 0),
  protein_snapshot     numeric(9,2) not null default 0 check (protein_snapshot >= 0),
  carbohydrates_snapshot numeric(9,2) not null default 0 check (carbohydrates_snapshot >= 0),
  fat_snapshot         numeric(9,2) not null default 0 check (fat_snapshot >= 0),
  quantity             numeric(9,3) not null check (quantity > 0),
  quantity_unit        text not null check (quantity_unit in ('g','ml','piece','serving')),
  meal_type            text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  consumed_at          timestamptz not null default now(),
  expires_at           timestamptz not null default (now() + interval '7 days'),
  created_at           timestamptz not null default now(),
  constraint food_logs_expiry_after_consumption check (expires_at > consumed_at)
);

create index if not exists food_logs_user_consumed_idx on public.food_logs (user_id, consumed_at desc);
create index if not exists food_logs_expires_idx on public.food_logs (expires_at);
create index if not exists food_logs_food_idx on public.food_logs (food_id);

-- expires_at is always consumed_at + 7 days, whatever the client sends.
create or replace function public.food_logs_set_expiry()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.expires_at := new.consumed_at + interval '7 days';
  return new;
end $$;

drop trigger if exists food_logs_set_expiry on public.food_logs;
create trigger food_logs_set_expiry before insert or update of consumed_at on public.food_logs
  for each row execute function public.food_logs_set_expiry();

-- Track frequently used foods.
create or replace function public.food_logs_bump_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.food_id is not null then
    update public.foods
       set use_count = use_count + 1, last_used_at = now()
     where id = new.food_id and user_id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists food_logs_bump_usage on public.food_logs;
create trigger food_logs_bump_usage after insert on public.food_logs
  for each row execute function public.food_logs_bump_usage();

-- ---------------------------------------------------------------- user_settings
create table if not exists public.user_settings (
  user_id               uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  daily_calorie_target  integer not null default 2000 check (daily_calorie_target between 500 and 10000),
  protein_target        integer not null default 100  check (protein_target between 0 and 1000),
  carbohydrate_target   integer not null default 250  check (carbohydrate_target between 0 and 2000),
  fat_target            integer not null default 70   check (fat_target between 0 and 1000),
  language              text not null default 'en' check (language in ('ar','fr','en')),
  preferred_units       text not null default 'metric' check (preferred_units in ('metric','imperial')),
  starter_loaded        boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- Row Level Security
alter table public.foods         enable row level security;
alter table public.food_logs     enable row level security;
alter table public.user_settings enable row level security;

revoke all on public.foods, public.food_logs, public.user_settings from anon;
grant select, insert, update, delete on public.foods, public.food_logs, public.user_settings to authenticated;

drop policy if exists foods_select on public.foods;
drop policy if exists foods_insert on public.foods;
drop policy if exists foods_update on public.foods;
drop policy if exists foods_delete on public.foods;
create policy foods_select on public.foods for select to authenticated using ((select auth.uid()) = user_id);
create policy foods_insert on public.foods for insert to authenticated with check ((select auth.uid()) = user_id);
create policy foods_update on public.foods for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy foods_delete on public.foods for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists logs_select on public.food_logs;
drop policy if exists logs_insert on public.food_logs;
drop policy if exists logs_update on public.food_logs;
drop policy if exists logs_delete on public.food_logs;
create policy logs_select on public.food_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy logs_insert on public.food_logs for insert to authenticated with check (
  (select auth.uid()) = user_id
  and (food_id is null or exists (
    select 1 from public.foods f where f.id = food_id and f.user_id = (select auth.uid())))
);
create policy logs_update on public.food_logs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (food_id is null or exists (
      select 1 from public.foods f where f.id = food_id and f.user_id = (select auth.uid())))
  );
create policy logs_delete on public.food_logs for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists settings_select on public.user_settings;
drop policy if exists settings_insert on public.user_settings;
drop policy if exists settings_update on public.user_settings;
drop policy if exists settings_delete on public.user_settings;
create policy settings_select on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy settings_insert on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy settings_update on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy settings_delete on public.user_settings for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- expired-history cleanup
-- Deletes ONLY rows of food_logs. Never touches public.foods.
create or replace function public.cleanup_expired_food_logs()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.food_logs where expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.cleanup_expired_food_logs() from public, anon, authenticated;
