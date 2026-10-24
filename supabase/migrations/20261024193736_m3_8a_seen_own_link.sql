-- M3-8a review (C338): a seen mark names only one of the account's own links, by the database as well as the app.

alter table family.school_links add constraint school_links_account_link unique (account_id, link_id);
alter table family.school_seen add constraint school_seen_own_link foreign key (account_id, link_id) references family.school_links (account_id, link_id) on delete cascade;
alter table family.school_seen drop constraint school_seen_link_id_fkey;
