-- P3 close-out (C180): who made a payment link.
--
-- Since C179 the nightly reminder may make a family's link, so created_by
-- may be empty. This says exactly when: a link is made by a 'person' (and
-- then names them) or by the 'reminder_job' (and then names nobody), and
-- only the platform role, which the nightly job runs as, may write the
-- second kind. Checked in the database, whoever writes. Neither the origin
-- nor the creator ever changes.
alter table payment_links add column origin text not null default 'person' check (origin in ('person', 'reminder_job'));
update payment_links set origin = 'reminder_job' where created_by is null;
alter table payment_links add constraint payment_links_origin_names_creator check ((origin = 'person') = (created_by is not null));

create function public.payment_links_origin() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.origin = 'reminder_job' and current_user <> 'nca_super' then
      raise exception 'only the nightly reminder makes a payment link without a person' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.origin is distinct from old.origin or new.created_by is distinct from old.created_by then
    raise exception 'who made a payment link never changes' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.payment_links_origin() from public;
create trigger payment_links_origin before insert or update on payment_links for each row execute function public.payment_links_origin();
