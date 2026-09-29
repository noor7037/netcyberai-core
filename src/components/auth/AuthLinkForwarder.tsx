'use client';

import { useEffect } from 'react';

// Supabase sends someone who taps an emailed sign-in or reset link to the
// site's home page when the login page is not on its redirect list, with the
// result in the URL fragment (#access_token=... or #error_code=...). The
// fragment never reaches the server, so this hands it to /login, which
// finishes the sign-in (C91). Renders nothing.
export function AuthLinkForwarder() {
  useEffect(() => {
    const { pathname, hash } = window.location;
    if (pathname === '/login') return;
    if (/[#&](access_token|error_code)=/.test(hash)) window.location.replace(`/login${hash}`);
  }, []);
  return null;
}
