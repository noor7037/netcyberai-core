import { redirect } from 'next/navigation';

// The bare /app index opens My Day (docs/19 rule 2, C136): today's work
// first, for every role. AppLayout has already confirmed a resolved
// membership exists by the time this runs.
export default function AppHomePage() {
  redirect('/app/my-day');
}
