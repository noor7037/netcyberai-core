-- W21 integration (C486), the certificate timeline: 20261105124719_w21_no_parent refused a parent outright, but
-- W21-M7 lets a guardian read the events of their own children's requests (certificate_request_events_who; the
-- requests themselves are scoped by certificate_requests_no_parent). The rule now reads as that one does; a parent
-- still writes nothing (the request's first event is the database's own, by its definer trigger).
alter policy certificate_request_events_no_parent on certificate_request_events
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent' or request_id in (select r.cert_id from certificate_requests r))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
