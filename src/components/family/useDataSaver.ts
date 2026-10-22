'use client';

import { useCallback, useEffect, useState } from 'react';
import { DATA_SAVER_KEY, dataSaverState, type DataSaverState } from '@/lib/family/data-saver';

// The data-saver on this phone (M2-9, C283): the family's choice in localStorage, else the phone's save-data hint, else
// off. Every part of the page that reads it follows a change at once.
const EVENT = 'ncf-data-saver';

function read(): DataSaverState {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(DATA_SAVER_KEY);
  } catch {
    // Storage blocked: the phone's hint, else off.
  }
  const hint = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  return dataSaverState(stored, hint);
}

export function useDataSaver(): { state: DataSaverState; ready: boolean; set: (on: boolean) => void } {
  const [state, setState] = useState<DataSaverState>({ on: false, source: 'default' });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setState(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const set = useCallback((on: boolean) => {
    try {
      window.localStorage.setItem(DATA_SAVER_KEY, on ? '1' : '0');
    } catch {
      // Storage blocked: the choice lasts for this part of the page only.
      return setState({ on, source: 'chosen' });
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { state, ready, set };
}

// Whether the phone is online now, following changes.
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return online;
}
