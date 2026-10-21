import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { shellTooOld, shellVersion, type FamilySwitches } from '@/lib/family/flags';

// M1-8 (C254): the Android shell. It shows only the live Family app over https (no other host, no plain http), has an
// offline page, reports its version so Control can ask old installs to update, and keeps every signing key out of the
// repository. No lock code: the Focus Lock is milestone M2b.
const ROOT = path.resolve(__dirname, '../..');
const config = JSON.parse(readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
const gradle = readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');

describe('the Android shell', () => {
  it('shows the live Family app over https, and nothing else', () => {
    expect(config.appId).toBe('com.netcyberai.family');
    expect(config.server.url).toBe('https://www.netcyberai.com/family');
    expect(config.server.cleartext).toBe(false);
    expect(config.server.allowNavigation).toEqual(['www.netcyberai.com', 'netcyberai.com']);
    expect(config.android.allowMixedContent).toBe(false);
    expect(config.android.webContentsDebuggingEnabled).toBe(false);
  });

  it('has an offline page in both languages', () => {
    const offline = readFileSync(path.join(ROOT, config.webDir, config.server.errorPath), 'utf8');
    expect(offline).toMatch(/इंटरनेट नहीं है/);
    expect(offline).toMatch(/No internet/);
    expect(offline).not.toMatch(/<script/i);
  });

  it('reports its version, the one the build carries', () => {
    const code = /versionCode (\d+)/.exec(gradle)![1];
    expect(config.android.appendUserAgent).toBe(`NetCyberAIFamily/${code}`);
    expect(shellVersion(`Mozilla/5.0 (Linux; Android 14) Chrome/120 ${config.android.appendUserAgent}`)).toBe(Number(code));
    const s = { minShell: 2 } as FamilySwitches;
    expect(shellTooOld(s, 'Mozilla/5.0 NetCyberAIFamily/1')).toBe(true);
    expect(shellTooOld(s, 'Mozilla/5.0 NetCyberAIFamily/2')).toBe(false);
    expect(shellTooOld(s, 'Mozilla/5.0 (a browser)')).toBe(false);
  });

  it('keeps signing keys out of the repository', () => {
    const tracked = execSync('git ls-files android', { cwd: ROOT, encoding: 'utf8' });
    expect(tracked).not.toMatch(/\.(jks|keystore|p12)$|keystore\.properties/m);
    expect(readFileSync(path.join(ROOT, 'android/.gitignore'), 'utf8')).toMatch(/keystore\.properties/);
    expect(gradle).toMatch(/rootProject\.file\('keystore\.properties'\)/);
  });

  it('carries no lock or app-watching code in M1', () => {
    const manifest = readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).not.toMatch(/PACKAGE_USAGE_STATS|SYSTEM_ALERT_WINDOW|BIND_ACCESSIBILITY_SERVICE|QUERY_ALL_PACKAGES/);
    expect(existsSync(path.join(ROOT, 'android/app/src/main/java/com/netcyberai/family/MainActivity.java'))).toBe(true);
  });
});
