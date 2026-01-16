-- Security hardening: do not require or retain exact address labels in crossed_paths.
-- We keep `address_key` for exact matching; `address_label` is now optional/redacted display text.

alter table public.crossed_paths
  alter column address_label drop not null;

-- Redact existing rows that look like numbered street addresses by removing the leading number.
-- Example: "123 Main St • City, ST" -> "Main St • City, ST"
update public.crossed_paths
set address_label = regexp_replace(address_label, '^\s*\d+\s+', '')
where address_label ~ '^\s*\d+\s+';

