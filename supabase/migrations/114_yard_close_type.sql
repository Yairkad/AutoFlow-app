-- How a yard work card was closed:
--   charged   — regular close (stock deducted, counted as revenue). NULL on older rows = charged.
--   free      — closed without charge (warranty / goodwill): stock deducted, revenue 0.
--   cancelled — card cancelled: no stock deduction, not counted at all.
alter table yard_sessions add column if not exists close_type text
  check (close_type in ('charged', 'free', 'cancelled'));
