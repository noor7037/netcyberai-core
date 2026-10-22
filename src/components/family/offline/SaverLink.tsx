'use client';

import Link from 'next/link';
import { useDataSaver } from '../useDataSaver';

// A link that fetches nothing ahead while the data-saver is on (M2-9, C283).
export function SaverLink(props: React.ComponentProps<typeof Link>) {
  const { state, ready } = useDataSaver();
  return <Link {...props} prefetch={!ready || state.on ? false : props.prefetch} />;
}
