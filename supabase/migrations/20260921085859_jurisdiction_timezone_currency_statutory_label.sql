-- Stage 1b (Pre-F Architecture Hardening): jurisdiction, timezone,
-- currency, and the Haryana-specific "form6_term" column, generalized
-- to what they'll actually need to be at national/international scale.

-- ---------------------------------------------------------------------
-- schools.jurisdiction: ISO-style state/country code (IN-HR, IN-MH,
-- AE-DU). No column DEFAULT -- captured explicitly at onboarding. The
-- two existing fixture rows are backfilled explicitly below (both are
-- Haryana test schools), not silently defaulted; the column is then
-- made NOT NULL so no future row can skip it.
-- ---------------------------------------------------------------------
alter table schools add column jurisdiction text;
update schools set jurisdiction = 'IN-HR' where jurisdiction is null;
alter table schools alter column jurisdiction set not null;

-- schools.timezone: 'Asia/Kolkata' is a TRUTHFUL default for every row
-- it will apply to today -- India is one timezone for the entire
-- current market -- unlike jurisdiction, where 'HR' was silently wrong
-- for every non-Haryana school. A default is only acceptable when it's
-- correct for every row it's applied to.
alter table schools add column timezone text not null default 'Asia/Kolkata';

-- ---------------------------------------------------------------------
-- compliance_config.state: the 'HR' default silently labelled every
-- school on the platform as Haryana. Zero rows exist yet (Prompt G,
-- the compliance-config feature, isn't built), so this is a pure
-- default-removal, no backfill needed. Required from here on: any
-- future insert of a compliance_config row must derive `state` from
-- the school's own `schools.jurisdiction` (e.g. the state segment of
-- 'IN-HR'), never rely on a database default -- recorded as the rule
-- in docs/10_DECISION_LOG.md for whichever prompt builds Prompt G.
-- ---------------------------------------------------------------------
alter table compliance_config alter column state drop default;

-- ---------------------------------------------------------------------
-- Fee tables: amount_paise -> amount_minor + explicit currency. A
-- column literally named "paise" holding a non-INR amount would be a
-- lie. Platform-internal WhatsApp-cost columns (communication_log.
-- est_cost_paise/gst_paise, schools.monthly_budget_paise) are
-- deliberately NOT touched -- they track NetCyberAI's own spend, not
-- school money; revisit only at international expansion.
-- ---------------------------------------------------------------------
alter table fee_structure_items rename column amount_paise to amount_minor;
alter table fee_structure_items add column currency char(3) not null default 'INR';

alter table fees_ledger rename column amount_paise to amount_minor;
alter table fees_ledger add column currency char(3) not null default 'INR';

alter table payments rename column amount_paise to amount_minor;
alter table payments add column currency char(3) not null default 'INR';

alter table fee_concessions rename column amount_off_paise to amount_off_minor;
alter table fee_concessions add column currency char(3) not null default 'INR';

-- ---------------------------------------------------------------------
-- fee_heads.form6_term -> statutory_label: the concept (a state-
-- mandated name for a fee head) is universal; the Haryana Form 6
-- number isn't. Nullable, unchanged.
-- ---------------------------------------------------------------------
alter table fee_heads rename column form6_term to statutory_label;
