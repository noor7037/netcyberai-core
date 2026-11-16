// The simulation sources a "Try it yourself" card may embed (Noor, 16 Nov 2026), and the checks of one stored card. Free of any
// server code, so the phone's bundle can check a card's address. The same hosts are the CSP frame-src of the Family app
// (next.config.js reads SIM_FRAME_HOSTS), so a host added here is allowed to load in a frame and nowhere else.
// Priority (sources.ts EMBED_ORDER): PhET, NASA Eyes, HHMI, Virtual Labs first; OLabs is a link card only (its pages refuse framing); LabXchange, Concord Consortium, Desmos, Smithsonian 3D tours
// and Google Arts and Culture next; Wolfram Demonstrations last. A source whose pages block embedding is dropped from the table.

export const SIM_HOSTS: Record<string, readonly string[]> = {
  phet: ['phet.colorado.edu'],
  nasa_eyes: ['eyes.nasa.gov'],
  hhmi: ['www.biointeractive.org'],
  vlabs: ['vlab.amrita.edu'],
  olabs: ['www.olabs.edu.in'],
  labxchange: ['www.labxchange.org'],
  concord: ['concord.org', 'lab.concord.org', 'models-resources.concord.org'],
  desmos: ['www.desmos.com'],
  smithsonian3d: ['3d.si.edu'],
  googlearts: ['artsandculture.google.com'],
  wolfram: ['demonstrations.wolfram.com'],
};
export const SIM_SOURCES = Object.keys(SIM_HOSTS);
// Hosts whose pages refuse to be framed (X-Frame-Options SAMEORIGIN, measured in docs/notes/lab-embeds-v21.md): the card is an
// "Open lab" link to a new tab, never an iframe, and the host is not in the CSP frame-src.
export const LINK_ONLY_HOSTS: readonly string[] = ['www.olabs.edu.in'];
export const SIM_FRAME_HOSTS: readonly string[] = Object.values(SIM_HOSTS).flat().filter((h) => !LINK_ONLY_HOSTS.includes(h));
export type SimMode = 'iframe' | 'link';
export function simMode(sim: { embed: string }): SimMode {
  try {
    return LINK_ONLY_HOSTS.includes(new URL(sim.embed).hostname) ? 'link' : 'iframe';
  } catch {
    return 'link';
  }
}

export type ElabSim = { source: string; title: string; embed: string; page: string; licence: string; preview?: string };

const https = (v: unknown, hosts: readonly string[]): string | null => {
  if (typeof v !== 'string' || v.length > 600) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && hosts.includes(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
};

// A stored card, or null when anything is wrong (a source it does not know, an address off that source's own hosts, a preview that is not one of our own files).
export function checkSim(v: unknown): ElabSim | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const source = typeof o.source === 'string' && SIM_HOSTS[o.source] ? o.source : null;
  if (!source) return null;
  const embed = https(o.embed, SIM_HOSTS[source]);
  const page = https(o.page, SIM_HOSTS[source]);
  const title = typeof o.title === 'string' ? o.title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  const licence = typeof o.licence === 'string' ? o.licence.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  if (!embed || !page || !title) return null;
  const preview = typeof o.preview === 'string' && /^\/sims\/[a-z0-9-]{2,80}\.jpg$/.test(o.preview) ? o.preview : undefined;
  return { source, title, embed, page, licence, ...(preview ? { preview } : {}) };
}
