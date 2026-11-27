-- Optional, end-to-end encrypted sync. The server only ever sees ciphertext:
--   vault_meta  per-user passkey PRF salt + wrapped data keys (not secret)
--   records     one row per window / tag / settings, payload = base64(iv || AES-GCM ciphertext)

create table public.vault_meta (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  meta jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  kind text not null check (kind in ('window', 'tag', 'settings')),
  updated_at bigint not null, -- client clock (epoch ms), last-writer-wins
  deleted boolean not null default false,
  payload text, -- null for tombstones
  server_updated_at timestamptz not null default now(), -- pull cursor
  primary key (user_id, id)
);

create index records_user_cursor on public.records (user_id, server_updated_at);

-- Last-writer-wins on the server too: an older write never overwrites a newer one.
create function public.records_lww() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- skip this row
  end if;
  new.server_updated_at := now();
  return new;
end $$;

create trigger records_lww before insert or update on public.records
  for each row execute function public.records_lww();

alter table public.vault_meta enable row level security;
alter table public.records enable row level security;

create policy "own vault meta" on public.vault_meta for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own records" on public.records for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
