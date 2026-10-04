import { redirect } from 'next/navigation';

// The bare /app index opens Home (the Dashboard module), which every
// role's menu starts with (C121; registry, 17 §2). AppLayout has already
// confirmed a resolved membership exists by the time this runs.
export default function AppHomePage() {
  redirect('/app/dashboard');
}
