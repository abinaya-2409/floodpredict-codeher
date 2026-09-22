-- Where the assistant's mistakes are kept.
--
-- Every answer the assistant gives about this city is checked against the
-- snapshot it was handed. When a figure does not match, the answer is sent
-- back to be corrected, and both halves land here: what was wrong, and
-- whether telling the model so actually fixed it.
--
-- The point of keeping it is the second column of that question. A correction
-- pass that never corrects anything is a cost with no benefit, and the only
-- way to know which it is - overall, and per kind of mistake - is to have the
-- record.
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.assistant_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),

  -- invented: a figure that is nowhere in the data
  -- altered:  a figure close to a real one, rounded or drifted - the more
  --           dangerous of the two, because it reads as though it were right
  -- misnamed: a ward, zone or shelter that does not exist here
  kind        text not null check (kind in ('invented', 'altered', 'misnamed')),

  -- What the model wrote, and the real figure where there was one.
  value       text not null,
  expected    text,

  -- The sentence it appeared in, and the question that led to it.
  context     text,
  question    text,

  model       text,

  -- 1 is the first answer, 2 the corrected one.
  attempt     smallint not null default 1,

  -- Whether the correction pass cleared this particular problem.
  -- Null on the final attempt, where there is nothing after it to judge.
  corrected   boolean
);

-- The two questions actually asked of this table: what has gone wrong lately,
-- and how often does each kind get fixed.
create index if not exists assistant_errors_created_at_idx
  on public.assistant_errors (created_at desc);

create index if not exists assistant_errors_kind_idx
  on public.assistant_errors (kind, corrected);

-- Written by the server with the service role key, which bypasses row level
-- security. RLS is still enabled and left without a policy, so the anon key
-- that ships in the browser can neither read nor write it.
alter table public.assistant_errors enable row level security;

comment on table public.assistant_errors is
  'Figures and names the flood assistant got wrong, and whether the correction pass fixed them.';


-- Does the correction pass earn its second model call?
--
--   select kind,
--          count(*)                                as caught,
--          count(*) filter (where corrected)       as fixed,
--          round(100.0 * count(*) filter (where corrected) / count(*), 1) as fixed_pct
--     from public.assistant_errors
--    where attempt = 1
--    group by kind
--    order by caught desc;
