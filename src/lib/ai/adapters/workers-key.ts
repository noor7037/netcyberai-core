// Cloudflare Workers AI's key, as Control takes it in two boxes (C317): the 32-hex Account ID that names the account in
// the URL, and the API token (Workers AI permission only) that is the secret. Each is cleaned of what copying often
// brings along (spaces, quotes, a "Bearer " from Cloudflare's own test command, capitals in the account id), then
// checked on its own. No network here, so the Control screen can check a box as it is filled in.
const ACCOUNT = /^[0-9a-f]{32}$/;
const TOKEN = /^[A-Za-z0-9_-]{30,80}$/;

export const cleanWorkersAccount = (v: string) => v.trim().replace(/^["']|["']$/g, '').toLowerCase();
export const cleanWorkersToken = (v: string) => v.trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
export const workersAccountLooksRight = (v: string) => ACCOUNT.test(v);
export const workersTokenLooksRight = (v: string) => TOKEN.test(v);
