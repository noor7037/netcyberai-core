import { redirect } from 'next/navigation';

// W11-A: /family/children is a guessed or old address; the children live in the parent area's Children section (W6-F).
export default function ChildrenPage(): never {
  redirect('/family/parent#children');
}
