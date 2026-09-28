// The shared state behind the homepage's side-by-side teacher and parent
// apps (founder, 2026-09-29, Decision Log C84). Each app reads this state
// and reports what it does as a LinkEvent, so an action on one phone
// shows up on the other at once. It is a preview with example data:
// nothing is sent anywhere.

export type Channel = 'attendance' | 'homework' | 'pulse' | 'marks' | 'ptm' | 'messages';

export interface LinkState {
  // Teacher to parent.
  att: 'absent' | 'present' | null;
  hw: string | null;
  pulse: string | null;
  marks: { mark: number; best: number } | null;
  ptm: boolean;
  reply: boolean;
  // Parent to teacher.
  leave: boolean;
  hwDone: boolean;
  pulseReply: string | null;
  ack: boolean;
  ptmConfirm: boolean;
  thanks: boolean;
}

export const EMPTY_LINK: LinkState = {
  att: null,
  hw: null,
  pulse: null,
  marks: null,
  ptm: false,
  reply: false,
  leave: false,
  hwDone: false,
  pulseReply: null,
  ack: false,
  ptmConfirm: false,
  thanks: false,
};

export type Side = 'teacher' | 'parent';

export interface LinkEvent {
  from: Side;
  channel: Channel;
  patch: Partial<LinkState>;
  text: string;
}

export type TeacherAction = 'attendance' | 'homework' | 'pulse' | 'marks' | 'ptm' | 'reply';
export type ParentAction = 'leave' | 'hwDone' | 'pulseReply' | 'ack' | 'ptmConfirm' | 'thanks';

// A request from the simulation to an app: open a screen, do an action,
// or both. A new id means a new request.
export interface LinkCommand<A> {
  id: number;
  view?: Channel;
  act?: A;
}

export interface AppLink<A> {
  state: LinkState;
  emit: (e: LinkEvent) => void;
  command: LinkCommand<A> | null;
  // The latest event from either side, so the other app can announce it.
  last: (LinkEvent & { id: number }) | null;
}

// The child both apps are about: in the teacher's class 6-A roster.
export const LINK_CHILD = 'Aarav S.';
export const LINK_HOMEWORK = 'Fractions worksheet 3';
export const LINK_LEAVE_NOTE = 'Aarav has a fever. He will be back tomorrow.';
export const LINK_REPLY = 'Of course. I have added one more worked example to tonight’s homework.';
export const LINK_THANKS = 'Thank you, ma’am! We will practise it together tonight.';
export const PULSE_REPLIES = ['Samajh aaya', 'Thoda samajh aaya', 'Samajh nahi aaya'];

export const CHANNELS: { id: Channel; label: string; icon: 'attendance' | 'homework' | 'pulse' | 'exams' | 'users' | 'chat' }[] = [
  { id: 'attendance', label: 'Attendance', icon: 'attendance' },
  { id: 'homework', label: 'Homework', icon: 'homework' },
  { id: 'pulse', label: 'Daily Pulse', icon: 'pulse' },
  { id: 'marks', label: 'Marks', icon: 'exams' },
  { id: 'ptm', label: 'PTM', icon: 'users' },
  { id: 'messages', label: 'Messages', icon: 'chat' },
];

// One school day, compressed: each teacher action followed by the
// parent's response on the same channel.
export type LoopStep = { side: 'teacher'; channel: Channel; act: TeacherAction } | { side: 'parent'; channel: Channel; act: ParentAction };

export const LOOP_STEPS: LoopStep[] = [
  { side: 'teacher', channel: 'attendance', act: 'attendance' },
  { side: 'parent', channel: 'attendance', act: 'leave' },
  { side: 'teacher', channel: 'homework', act: 'homework' },
  { side: 'parent', channel: 'homework', act: 'hwDone' },
  { side: 'teacher', channel: 'pulse', act: 'pulse' },
  { side: 'parent', channel: 'pulse', act: 'pulseReply' },
  { side: 'teacher', channel: 'marks', act: 'marks' },
  { side: 'parent', channel: 'marks', act: 'ack' },
  { side: 'teacher', channel: 'ptm', act: 'ptm' },
  { side: 'parent', channel: 'ptm', act: 'ptmConfirm' },
  { side: 'teacher', channel: 'messages', act: 'reply' },
  { side: 'parent', channel: 'messages', act: 'thanks' },
];
