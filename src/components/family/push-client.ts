import { familyApi } from './client';

// Signing out on this browser (M3-8b, C339): it stops being told of anything new, before the session ends. Never throws.
export async function forgetThisBrowser(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration('/family/');
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await familyApi('/api/family/push', 'POST', { action: 'unsubscribe', endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch {
    // signing out goes on
  }
}
