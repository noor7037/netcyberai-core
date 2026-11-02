import { switchOn, type FamilySwitches } from './flags';

// Which parts of the Tutor programme are on for this family (W16-B5), read from Control → Apps at run time and nowhere
// else, so the home tile, Study's header and composer, the Hall's Call button, the call's route and the answer's board
// all agree. A part Control never saved is on (C230-Z); a part switched off hides its entry points, and its route says
// "This part is switched off". The call also needs the modules it is built on (Understand, which answers, and the voice
// module, whose microphone it shares): a child who cannot ask by voice is not offered a call.
export type TutorParts = { hall: boolean; call: boolean; board: boolean; quiz: boolean; reports: boolean };

export function tutorParts(s: FamilySwitches): TutorParts {
  return {
    hall: switchOn(s, 'tutor_hall'),
    call: switchOn(s, 'tutor_call') && switchOn(s, 'understand') && switchOn(s, 'voice_input'),
    board: switchOn(s, 'tutor_board'),
    quiz: switchOn(s, 'tutor_quiz'),
    reports: switchOn(s, 'tutor_reports'),
  };
}
