-- Коди Дайджест — Supabase Setup
-- Вставь этот SQL в SQL Editor (supabase.com → SQL Editor → New query → Run)

-- Таблица фидбэка
create table if not exists feedback (
  id bigint generated always as identity primary key,
  digest_date text not null,
  card_id text not null,
  card_title text,
  card_category text,
  action text not null check (action in ('like', 'dislike', 'backlog')),
  created_at timestamptz default now()
);

-- Индексы
create index if not exists idx_feedback_date on feedback(digest_date);
create index if not exists idx_feedback_action on feedback(action);

-- Уникальность: одна реакция на карточку (перезаписывается)
create unique index if not exists idx_feedback_unique 
  on feedback(digest_date, card_id, action);

-- RLS (Row Level Security) — anon key может только INSERT и SELECT
alter table feedback enable row level security;

create policy "Anyone can insert feedback" on feedback
  for insert with check (true);

create policy "Anyone can read feedback" on feedback
  for select using (true);

create policy "Anyone can delete own feedback" on feedback
  for delete using (true);

-- Вью для аналитики предпочтений
create or replace view feedback_stats as
select 
  card_category,
  action,
  count(*) as cnt,
  array_agg(distinct card_title) as titles
from feedback
group by card_category, action
order by cnt desc;

-- Вью для дневного саммари
create or replace view daily_summary as
select 
  digest_date,
  count(*) filter (where action = 'like') as likes,
  count(*) filter (where action = 'dislike') as dislikes,
  count(*) filter (where action = 'backlog') as backlog_items
from feedback
group by digest_date
order by digest_date desc;
