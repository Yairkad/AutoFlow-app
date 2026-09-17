-- Credit-card statements commonly carry two distinct dates per transaction --
-- the purchase/transaction date (used for matching against expenses/income,
-- unchanged) and the charge date (when it actually posts to the bank
-- account, often weeks later, once a month) -- plus which card was used when
-- a tenant has more than one. Both are optional/informational only: matching
-- in lib/bank-sync/matchSuggestions.ts still keys off the primary `date`
-- column (mapped to the transaction date), never charge_date.
ALTER TABLE bank_statement_lines
  ADD COLUMN IF NOT EXISTS charge_date date,
  ADD COLUMN IF NOT EXISTS card_number text;
