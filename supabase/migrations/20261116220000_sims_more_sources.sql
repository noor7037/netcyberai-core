-- Curated simulations: two more sources (olabs, vlabs) and GeoGebra removed (its licence is non-commercial; its rows are gone).
-- Only the check on `source` is replaced; no row is read or changed. OLabs pages refuse framing, so the app shows an "Open lab" link
-- card for them (src/lib/family/sim-hosts.ts LINK_ONLY_HOSTS); Virtual Labs (vlab.amrita.edu) is embedded.
alter table content.curated_topic_sims drop constraint if exists curated_topic_sims_source_check;
alter table content.curated_topic_sims add constraint curated_topic_sims_source_check
  check (source in ('phet', 'nasa_eyes', 'hhmi', 'vlabs', 'labxchange', 'concord', 'desmos', 'smithsonian3d', 'googlearts', 'wolfram', 'olabs'));
