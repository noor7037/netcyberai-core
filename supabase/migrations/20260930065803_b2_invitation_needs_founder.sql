-- =====================================================================
-- B2 (Decision Log C98, security-review finding): an invitation from a
-- school to an email that already has a NetCyberAI account never attaches
-- that account by itself. It stops at 'needs_founder': nothing is created,
-- no email is sent, and NetCyberAI resolves it with the account's owner.
-- (An approved application's principal is still attached: they proved
-- that email with a code when they applied.)
-- =====================================================================
alter table staff_invitations drop constraint staff_invitations_status_check;
alter table staff_invitations add constraint staff_invitations_status_check
  check (status in ('pending', 'sent', 'accepted', 'revoked', 'needs_founder'));
