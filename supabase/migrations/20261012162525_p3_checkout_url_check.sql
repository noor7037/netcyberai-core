-- Correction to 20261012161644_p3_payment_rails (C172).
--
-- The check on payment_links.checkout_url used a repetition count of 500 in
-- its pattern. PostgreSQL allows at most 255, and only finds out when a
-- value is written: the first link with a checkout address failed. No row
-- had one yet. The same rule, written with a length check.
alter table payment_links drop constraint payment_links_checkout_url_check;
alter table payment_links add constraint payment_links_checkout_url_check
  check (checkout_url is null or (char_length(checkout_url) <= 500 and checkout_url ~ '^(/|https://)[^[:space:]]+$'));
