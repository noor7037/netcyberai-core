'use client';

import { useCallback, useEffect, useState } from 'react';
import { EMPTY_PROFILE, PROFILE_EVENT, PROFILE_KEY, clearProfile, readProfile, saveProfile, type SchoolProfile } from '@/lib/free-tools/school-profile';

// The school's saved details for any free tool. Read after mount, so the
// server HTML (no profile) and the first client render always match, and
// refreshed whenever another tool or another tab saves or clears them.
export function useSchoolProfile() {
  const [profile, setProfile] = useState<SchoolProfile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const refresh = () => setProfile(readProfile());
    refresh();
    setLoaded(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PROFILE_KEY) refresh();
    };
    window.addEventListener(PROFILE_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PROFILE_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const save = useCallback((p: SchoolProfile) => saveProfile(p), []);
  const clear = useCallback(() => clearProfile(), []);

  return { profile, loaded, save, clear };
}
