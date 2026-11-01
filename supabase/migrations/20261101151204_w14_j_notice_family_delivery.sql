-- W14-J: a notice reaches a linked family in the Family app, and the school's delivery log says so.
--
-- 1. The delivery log gets the channel the Family app is. (A notice itself is not copied into the family's rows: the
--    app reads the approved notice as the guardian through School Link, so the school's own parent rules and consent
--    decide what is shown. The log row is the school's record that it was there to read.)
-- 2. The school's office may ask which of a school's guardians have the Family app linked, with the students their
--    family matched to it. Staff cannot read family.* tables, so one definer function answers, for the caller's own
--    school only and for the principal and the school admin only, and says nothing else: no account, no email, no child
--    of the family.
alter type comm_channel add value if not exists 'family_app';

create function family.linked_children_for_notice(p_parents uuid[])
returns table (parent_id uuid, student_id uuid)
language sql stable security definer set search_path = '' as $$
  select l.parent_id, c.student_id
    from family.school_links l
    join family.child_links c on c.link_id = l.link_id
   where l.revoked_at is null
     and l.parent_id = any (p_parents)
     and l.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin')
$$;
revoke all on function family.linked_children_for_notice(uuid[]) from public;
grant execute on function family.linked_children_for_notice(uuid[]) to app_user;

-- 3. The principal's approval of a notice queues its emails in the same transaction, as it queues its WhatsApp messages.
--    (The policy is restated whole, with W14-F's exam.report_card clause kept: an `alter policy` replaces the check.)
--    Only that: an email.send job of the school_notice template, for the caller's own school, from a principal. (Every other
--    email is queued by the platform's own jobs.)
alter policy jobs_enqueue on jobs
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run', 'ticket.notify', 'whatsapp.send', 'ptm.remind', 'event.remind', 'complaint.escalate')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
    or (
      type in ('marking.read', 'marking.group', 'marking.mark', 'papers.make')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
      and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator', 'teacher')
    )
    or (
      type = 'exam.report_card'
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
      and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator')
    )
    or (
      type = 'email.send'
      and payload ->> 'template' = 'school_notice'
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
      and coalesce(current_setting('app.current_role', true), '') = 'principal'
    )
  );
