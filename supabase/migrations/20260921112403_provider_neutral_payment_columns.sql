-- Stage 1c (Pre-F Architecture Hardening): provider-neutral payment
-- columns. webhook_events.provider is already the right precedent --
-- this matches it. Fee code (Prompt I) isn't built yet, so this costs
-- nothing today (confirmed: zero references in src/ to the old names).
alter table fees_ledger rename column razorpay_order_id to gateway_order_id;
alter table fees_ledger rename column razorpay_payment_id to gateway_payment_id;
alter table fees_ledger add column gateway text not null default 'razorpay';

alter table payments rename column razorpay_payment_id to gateway_payment_id;
alter table payments add column gateway text not null default 'razorpay';
