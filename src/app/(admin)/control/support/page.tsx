import { redirect } from 'next/navigation';

// Support in the Control navigation is the ticket queue (C126).
export default function SupportPage() {
  redirect('/control/tickets');
}
