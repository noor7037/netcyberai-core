import { Capacitor, registerPlugin } from '@capacitor/core';

// The Family app's side of the Focus app's connection (C538), in the Android app only: the native FocusLink plugin
// (android/app/src/main/java/com/netcyberai/family/FocusLinkPlugin.java) talks to the NetCyberAI Focus app on the same
// phone, and only when both apps are signed with the same key.
export type FocusLinkStatus = { installed: boolean; sameKey: boolean };
type FocusLink = {
  status(): Promise<FocusLinkStatus>;
  deviceId(): Promise<{ deviceId: string }>;
  link(o: { pass: string; lang: string }): Promise<{ ok: boolean }>;
  open(): Promise<void>;
  install(): Promise<void>;
};

const plugin = registerPlugin<FocusLink>('FocusLink');
export const focusLinkAvailable = () => typeof window !== 'undefined' && Capacitor.isPluginAvailable('FocusLink');
export const focusLink = plugin;

// Sets this phone up for the chosen children and hands the Focus app its pass: the phone's id is read from the Focus
// app, the parent area (parent mode) registers it and asks the pass, and the Focus app receives it.
export async function connectFocusApp(childIds: string[], lang: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { deviceId } = await plugin.deviceId();
    const headers = { 'content-type': 'application/json', 'x-focus-device': deviceId };
    const put = await fetch('/api/family/focus/devices', { method: 'PUT', headers, body: JSON.stringify({ childIds }), credentials: 'same-origin' });
    if (!put.ok) return { ok: false, error: String(((await put.json().catch(() => ({}))) as { error?: string }).error ?? 'network') };
    const res = await fetch('/api/family/focus/pass', { method: 'POST', headers, credentials: 'same-origin' });
    const body = (await res.json().catch(() => ({}))) as { pass?: string; error?: string };
    if (!res.ok || !body.pass) return { ok: false, error: body.error ?? 'network' };
    const linked = await plugin.link({ pass: body.pass, lang });
    if (!linked.ok) return { ok: false, error: 'focus_app' };
    await plugin.open();
    return { ok: true };
  } catch {
    return { ok: false, error: 'focus_app' };
  }
}
