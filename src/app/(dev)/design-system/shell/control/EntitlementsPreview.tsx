'use client';

import { useMemo } from 'react';
import { SchoolEntitlementsPanel } from '@/components/control/SchoolEntitlementsPanel';
import { createEntitlementsPreviewApi } from '@/demo-fixture/control-entitlements';

export function EntitlementsPreview() {
  const api = useMemo(() => createEntitlementsPreviewApi(), []);
  return <SchoolEntitlementsPanel api={api} />;
}
