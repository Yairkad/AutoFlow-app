-- Yard customer requests: "we called, no answer" marker, independent of the request status
alter table customer_requests add column if not exists no_answer_count int not null default 0;
alter table customer_requests add column if not exists no_answer_at timestamptz;
