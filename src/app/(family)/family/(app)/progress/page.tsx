import { redirect } from 'next/navigation';

// W11-A: /family/progress is a guessed or old address; progress is the parent area's Overview section (W6-F).
export default function ProgressPage(): never {
  redirect('/family/parent#overview');
}
