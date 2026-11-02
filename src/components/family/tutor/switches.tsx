'use client';

import { createContext, useContext, type ReactNode } from 'react';

// What Control → Apps has switched for the Tutor's parts that live inside answers (W16-B5), read once by the Family app's
// layout on every request and handed down, so any screen that draws an answer (Study's feed, the lesson page, the call's
// board) leaves out the drawing board and the simulations while `tutor_board` is off. The answer's words are unchanged.
// A screen drawn outside the layout keeps the default: on (the module is on until Control says otherwise).
const Switches = createContext<{ board: boolean }>({ board: true });

export function TutorSwitches({ board, children }: { board: boolean; children: ReactNode }) {
  return <Switches.Provider value={{ board }}>{children}</Switches.Provider>;
}

export const useTutorBoard = () => useContext(Switches).board;
