// Test-only stand-ins for Supabase Auth and the Postgres pool (C95), used by
// the authenticator flow tests to run the real sign-in, account-page and
// founder-tool code with no network or database. Never imported by app code.
//
// The fake keeps the Supabase Auth rules the authenticator code relies on:
// - a password session is aal1 with amr [password]; an emailed-code session
//   is aal1 with amr [otp];
// - confirming a factor's first code verifies it and lifts the session to
//   aal2;
// - enrolling a new factor, or removing a confirmed one, needs aal2 once the
//   account has a confirmed factor (insufficient_aal otherwise);
// - friendly names must be distinct per account;
// - listFactors().totp lists confirmed TOTP factors only; .all lists all.
// Every call yields to the event loop first, so two requests at once
// interleave the way two HTTP calls to Supabase would.
import { randomBytes, randomUUID } from 'crypto';
import { totpCode } from '../../scripts/b2-verify/totp';

type Amr = { method: string; timestamp: number };
type FakeSession = { access_token: string; refresh_token: string; userId: string; aal: 'aal1' | 'aal2'; amr: Amr[] };
export type FakeFactor = {
  id: string;
  userId: string;
  factor_type: 'totp';
  status: 'verified' | 'unverified';
  friendly_name: string;
  created_at: string;
  secret: string;
};
export type FakeUser = { id: string; email: string; password: string; role: string; token_version: number; is_active: boolean };
type Result<T> = { data: T; error: { message: string; code?: string; status?: number } | null };

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const fail = <T>(data: T, message: string, code?: string): Result<T> => ({ data, error: { message, code, status: 400 } });

function b64url(v: unknown): string {
  return Buffer.from(JSON.stringify(v)).toString('base64url');
}

function base32(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

export class FakeSupabase {
  users = new Map<string, FakeUser>();
  factors: FakeFactor[] = [];
  sessions = new Map<string, FakeSession>();
  emailedCodes = new Map<string, string>();
  sentCodes: string[] = [];
  auditRows: Record<string, unknown>[] = [];
  sessionsRevoked: { userId: string; keep: string | null }[] = [];
  // "Trust this browser" rows (F1-1), as trusted_devices holds them.
  devices = new Map<string, { device_id: string; user_id: string; proof: string; label: string; expires_at: Date; revoked_at: Date | null; last_used_at: Date }>();
  // Sessions marked "not kept signed in" (F1-1).
  notPersistent: string[] = [];
  private clock = Date.parse('2026-09-30T10:00:00Z');

  reset() {
    this.users.clear();
    this.factors = [];
    this.sessions.clear();
    this.emailedCodes.clear();
    this.sentCodes = [];
    this.auditRows = [];
    this.sessionsRevoked = [];
    this.devices.clear();
    this.notPersistent = [];
  }

  addUser(u: Partial<FakeUser> & { email: string; password: string; role: string }): FakeUser {
    const user: FakeUser = { id: randomUUID(), token_version: 0, is_active: true, ...u };
    this.users.set(user.id, user);
    return user;
  }

  // A confirmed authenticator, as if set up earlier.
  addVerifiedFactor(userId: string): FakeFactor {
    const f = this.newFactor(userId, `old ${this.factors.length}`);
    f.status = 'verified';
    return f;
  }

  factorsOf(userId: string): FakeFactor[] {
    return this.factors.filter((f) => f.userId === userId);
  }

  codeFor(factor: { secret: string } | string): string {
    return totpCode(typeof factor === 'string' ? factor : factor.secret);
  }

  private now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private newFactor(userId: string, friendlyName: string): FakeFactor {
    const f: FakeFactor = {
      id: randomUUID(),
      userId,
      factor_type: 'totp',
      status: 'unverified',
      friendly_name: friendlyName,
      created_at: this.now(),
      secret: base32(randomBytes(20)),
    };
    this.factors.push(f);
    return f;
  }

  private newSession(userId: string, method: string, aal: 'aal1' | 'aal2' = 'aal1', amr?: Amr[]): FakeSession {
    const at = Math.floor(Date.now() / 1000);
    const methods = amr ?? [{ method, timestamp: at }];
    const access_token = `${b64url({ alg: 'HS256' })}.${b64url({ sub: userId, aal, amr: methods, n: randomUUID() })}.sig`;
    const s: FakeSession = { access_token, refresh_token: randomUUID(), userId, aal, amr: methods };
    this.sessions.set(access_token, s);
    return s;
  }

  private hasVerified(userId: string): boolean {
    return this.factorsOf(userId).some((f) => f.status === 'verified');
  }

  private userByEmail(email: string): FakeUser | undefined {
    return [...this.users.values()].find((u) => u.email === email);
  }

  // A fresh client, as newAuthClient() gives: no session until one is set.
  client() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const fake = this;
    let current: FakeSession | null = null;
    const sessionView = (s: FakeSession) => ({ access_token: s.access_token, refresh_token: s.refresh_token, user: { id: s.userId } });
    const need = () => {
      if (!current) throw new Error('fake: no session on this client');
      return current;
    };
    const verifyFactor = (factorId: string, code: string): Result<unknown> => {
      const s = need();
      const f = fake.factors.find((x) => x.id === factorId && x.userId === s.userId);
      if (!f) return fail(null, 'Factor not found', 'mfa_factor_not_found');
      if (code !== totpCode(f.secret)) return fail(null, 'Invalid TOTP code entered', 'mfa_verification_failed');
      f.status = 'verified';
      // Supabase issues a new aal2 session after a successful verify.
      const amr = [...s.amr, { method: 'totp', timestamp: Math.floor(Date.now() / 1000) }];
      current = fake.newSession(s.userId, 'totp', 'aal2', amr);
      return { data: sessionView(current), error: null };
    };

    return {
      auth: {
        async signInWithPassword({ email, password }: { email: string; password: string }) {
          await tick();
          const u = fake.userByEmail(email);
          if (!u || u.password !== password) return fail({ session: null, user: null }, 'Invalid login credentials', 'invalid_credentials');
          current = fake.newSession(u.id, 'password');
          return { data: { session: sessionView(current), user: { id: u.id } }, error: null };
        },
        async signInWithOtp({ email }: { email: string }) {
          await tick();
          const code = String(100000 + (randomBytes(3).readUIntBE(0, 3) % 900000));
          fake.emailedCodes.set(email, code);
          fake.sentCodes.push(email);
          return { data: {}, error: null };
        },
        async verifyOtp({ email, token }: { email: string; token: string; type: string }) {
          await tick();
          const u = fake.userByEmail(email);
          if (!u || fake.emailedCodes.get(email) !== token) return fail({ session: null, user: null }, 'Token has expired or is invalid', 'otp_expired');
          fake.emailedCodes.delete(email);
          current = fake.newSession(u.id, 'otp');
          return { data: { session: sessionView(current), user: { id: u.id } }, error: null };
        },
        async setSession({ access_token }: { access_token: string; refresh_token: string }) {
          await tick();
          const s = fake.sessions.get(access_token);
          if (!s) return fail({ session: null, user: null }, 'Invalid session');
          current = s;
          return { data: { session: sessionView(s), user: { id: s.userId } }, error: null };
        },
        async updateUser({ password }: { password?: string }) {
          await tick();
          const s = need();
          // Supabase needs aal2 to change the password once a factor is confirmed.
          if (fake.hasVerified(s.userId) && s.aal !== 'aal2') return fail({ user: null }, 'AAL2 session is required', 'insufficient_aal');
          const u = fake.users.get(s.userId)!;
          if (password) u.password = password;
          return { data: { user: { id: u.id } }, error: null };
        },
        async getSession() {
          await tick();
          return { data: { session: current ? sessionView(current) : null }, error: null };
        },
        mfa: {
          async listFactors() {
            await tick();
            const all = fake.factorsOf(need().userId).map((f) => ({
              id: f.id,
              factor_type: f.factor_type,
              status: f.status,
              friendly_name: f.friendly_name,
              created_at: f.created_at,
            }));
            return { data: { all, totp: all.filter((f) => f.status === 'verified') }, error: null };
          },
          async getAuthenticatorAssuranceLevel() {
            await tick();
            const s = need();
            return {
              data: { currentLevel: s.aal, nextLevel: fake.hasVerified(s.userId) ? 'aal2' : 'aal1', currentAuthenticationMethods: s.amr },
              error: null,
            };
          },
          async enroll({ friendlyName, issuer }: { factorType: 'totp'; friendlyName: string; issuer?: string }) {
            await tick();
            const s = need();
            if (fake.hasVerified(s.userId) && s.aal !== 'aal2') return fail(null, 'AAL2 required to enroll a new factor', 'insufficient_aal');
            if (fake.factorsOf(s.userId).some((f) => f.friendly_name === friendlyName)) {
              return fail(null, 'A factor with the friendly name already exists', 'mfa_factor_name_conflict');
            }
            const f = fake.newFactor(s.userId, friendlyName);
            const email = fake.users.get(s.userId)?.email ?? '';
            const uri = `otpauth://totp/${issuer}:${email}?secret=${f.secret}&issuer=${issuer}`;
            // Raw, unescaped SVG with a '#', as Supabase sends it.
            const qr_code = `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000000"/><desc>${uri}</desc></svg>`;
            return { data: { id: f.id, type: 'totp' as const, friendly_name: friendlyName, totp: { qr_code, secret: f.secret, uri } }, error: null };
          },
          async unenroll({ factorId }: { factorId: string }) {
            await tick();
            const s = need();
            const f = fake.factors.find((x) => x.id === factorId && x.userId === s.userId);
            if (!f) return fail(null, 'Factor not found', 'mfa_factor_not_found');
            if (f.status === 'verified' && s.aal !== 'aal2') return fail(null, 'AAL2 required to unenroll verified factor', 'insufficient_aal');
            fake.factors = fake.factors.filter((x) => x.id !== factorId);
            return { data: { id: factorId }, error: null };
          },
          async challenge({ factorId }: { factorId: string }) {
            await tick();
            return { data: { id: `challenge-${factorId}` }, error: null };
          },
          async verify({ factorId, code }: { factorId: string; challengeId: string; code: string }) {
            await tick();
            return verifyFactor(factorId, code);
          },
          async challengeAndVerify({ factorId, code }: { factorId: string; code: string }) {
            await tick();
            return verifyFactor(factorId, code);
          },
        },
      },
    };
  }

  // The service-role client's MFA admin calls (founder tools).
  admin() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const fake = this;
    return {
      auth: {
        admin: {
          mfa: {
            async listFactors({ userId }: { userId: string }) {
              await tick();
              return { data: { factors: fake.factorsOf(userId).map(({ secret: _s, ...f }) => f) }, error: null };
            },
            async deleteFactor({ userId, id }: { userId: string; id: string }) {
              await tick();
              fake.factors = fake.factors.filter((f) => !(f.id === id && f.userId === userId));
              return { data: { id }, error: null };
            },
          },
        },
      },
    };
  }

  // A pg PoolClient stand-in answering the handful of queries these flows run.
  db() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const fake = this;
    return {
      async query(sql: string, params: unknown[] = []) {
        await tick();
        const text = sql.replace(/\s+/g, ' ').trim();
        const user = fake.users.get(String(params[0]));
        if (/^select email from users/.test(text)) return { rows: user ? [{ email: user.email }] : [], rowCount: user ? 1 : 0 };
        if (/^select role, token_version, is_active from users/.test(text)) return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
        if (/^select user_id, display_name, email, role, is_active, school_id from users/.test(text)) {
          return {
            rows: user ? [{ user_id: user.id, display_name: 'Test', email: user.email, role: user.role, is_active: user.is_active, school_id: null }] : [],
            rowCount: user ? 1 : 0,
          };
        }
        if (/^update users set token_version = token_version \+ 1/.test(text)) {
          if (user) user.token_version += 1;
          return { rows: user ? [{ token_version: user.token_version }] : [], rowCount: user ? 1 : 0 };
        }
        if (/^update sessions set revoked_at/.test(text)) {
          fake.sessionsRevoked.push({ userId: String(params[0]), keep: (params[1] as string | null) ?? null });
          return { rows: [], rowCount: 1 };
        }
        if (/^insert into trusted_devices/.test(text)) {
          const [user_id, proof, label, expires_at] = params as [string, string, string, Date];
          const device_id = randomUUID();
          fake.devices.set(device_id, { device_id, user_id, proof, label, expires_at, revoked_at: null, last_used_at: new Date() });
          return { rows: [{ device_id }], rowCount: 1 };
        }
        const live = (d: { revoked_at: Date | null; expires_at: Date }) => !d.revoked_at && d.expires_at.getTime() > Date.now();
        if (/^update trusted_devices set last_used_at = now\(\) where device_id = \$1 and user_id = \$2/.test(text)) {
          const d = fake.devices.get(String(params[0]));
          if (!d || d.user_id !== params[1] || !live(d)) return { rows: [], rowCount: 0 };
          d.last_used_at = new Date();
          return { rows: [{ proof: d.proof }], rowCount: 1 };
        }
        if (/^update trusted_devices set revoked_at = now\(\) where device_id = \$1 and user_id = \$2/.test(text)) {
          const d = fake.devices.get(String(params[0]));
          if (!d || d.user_id !== params[1] || d.revoked_at) return { rows: [], rowCount: 0 };
          d.revoked_at = new Date();
          return { rows: [], rowCount: 1 };
        }
        if (/^update trusted_devices set revoked_at = now\(\) where user_id = \$1/.test(text)) {
          let n = 0;
          for (const d of fake.devices.values()) if (d.user_id === params[0] && !d.revoked_at) (d.revoked_at = new Date()), n++;
          return { rows: [], rowCount: n };
        }
        if (/^select device_id, label, proof, created_at, last_used_at, expires_at from trusted_devices/.test(text)) {
          const rows = [...fake.devices.values()].filter((d) => d.user_id === params[0] && live(d)).map((d) => ({ ...d, created_at: d.last_used_at }));
          return { rows, rowCount: rows.length };
        }
        if (/^update sessions set persistent = false/.test(text)) {
          fake.notPersistent.push(String(params[0]));
          return { rows: [], rowCount: 1 };
        }
        // No school memberships: a sign-in that gets this far ends in no_memberships.
        if (/ from memberships m /.test(text)) return { rows: [], rowCount: 0 };
        if (/^insert into sessions/.test(text)) return { rows: [{ session_id: randomUUID() }], rowCount: 1 };
        if (/^insert into audit_log/.test(text)) {
          const [school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state] = params;
          fake.auditRows.push({ school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state });
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`fake db: unexpected query: ${text.slice(0, 80)}`);
      },
    };
  }
}

export const fakeSupabase = new FakeSupabase();
