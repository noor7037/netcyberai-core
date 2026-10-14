import { addDays } from '@/lib/free-tools/admissions-tracker';
import type { FeePromise } from '@/lib/free-tools/fee-promise';

// Example promises for the Fee Promise-to-Pay Tracker's "Try an example"
// button. Fictional students and staff at a fictional school; no real
// people or amounts. Dates are set around today so every status shows.
// Kept in the demo fixture because it is demonstration data.

export function feePromiseExample(today: string): FeePromise[] {
  const d = (n: number) => addDays(today, n);
  const base = { amountReceived: '', receivedDate: '', needsHelp: false, helpStaff: '', helpNote: '' };
  return [
    { ...base, id: 'ex-1', student: 'Aarav Mehta', className: '4B', phone: '98765 41001', amountDue: '12000', amountPromised: '6000', promisedDate: d(-4), owner: 'Mrs Kapoor' },
    { ...base, id: 'ex-2', student: 'Diya Nair', className: '2A', phone: '98765 41002', amountDue: '8000', amountPromised: '8000', promisedDate: d(-6), owner: 'Mr Khan', amountReceived: '3000', receivedDate: d(-5) },
    { ...base, id: 'ex-3', student: 'Kabir Singh', className: '7C', phone: '98765 41003', amountDue: '15000', amountPromised: '5000', promisedDate: d(0), owner: 'Mrs Kapoor' },
    { ...base, id: 'ex-4', student: 'Ananya Gupta', className: '5A', phone: '98765 41004', amountDue: '9000', amountPromised: '9000', promisedDate: d(-10), owner: 'Mr Khan', amountReceived: '9000', receivedDate: d(-11) },
    { ...base, id: 'ex-5', student: 'Rohan Das', className: '3B', phone: '98765 41005', amountDue: '7000', amountPromised: '3500', promisedDate: d(3), owner: 'Mr Khan' },
    { ...base, id: 'ex-6', student: 'Sara Thomas', className: '9A', phone: '98765 41006', amountDue: '18000', amountPromised: '10000', promisedDate: d(8), owner: 'Mrs Kapoor' },
    { ...base, id: 'ex-7', student: 'Vivaan Reddy', className: '1A', phone: '98765 41007', amountDue: '6000', amountPromised: '', promisedDate: '', owner: '', needsHelp: true, helpStaff: 'Mr Fernandes (accounts)', helpNote: 'Parent unwell; family asked to pay in instalments' },
    { ...base, id: 'ex-8', student: 'Myra Kulkarni', className: '6B', phone: '98765 41008', amountDue: '11000', amountPromised: '11000', promisedDate: d(-2), owner: 'Mr Khan', amountReceived: '11000', receivedDate: d(0) },
    { ...base, id: 'ex-9', student: 'Ishaan Bhatt', className: '8A', phone: '2345 678', amountDue: '10000', amountPromised: '4000', promisedDate: d(-1), owner: 'Mrs Kapoor' },
  ];
}
