-- C127: a school session may enqueue one more job type, ticket.notify, for
-- its own school: "tell NetCyberAI a ticket was raised". The job carries the
-- ticket's id only; the platform handler reads the ticket itself, checks it
-- belongs to the job's school, and chooses the recipient and the words.
-- Everything else about jobs is unchanged: the two types a school could
-- already enqueue (invite.send, C98; bulk.run, C112) stay, with no read, no
-- update and no other type. ALTER, so the policy is never absent.
alter policy jobs_enqueue on jobs
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run', 'ticket.notify')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
  );
