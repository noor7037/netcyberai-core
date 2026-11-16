# Read-aloud stutter (tutor v21)

What the child heard: a click and 1 to 2 s (sometimes much longer) of silence between parts of an answer read aloud,
sometimes stuck. The server voice did not fail (family.text_to_speech: 0 failures) and the prefetch key matched.

## Measured

`control.ai_usage_ledger`, profile `family.text_to_speech`, last 14 days on the dev project, outcome `ok` (read only):

| Provider | Calls | p50 | p90 | Max | Fit |
|---|---|---|---|---|---|
| gemini-3.8-flash-tts | 75 | 3.5 s | 10.1 s | 12.0 s | about 2.5 s + 16 ms per character (r = 0.97) |
| google_tts Standard-A | 82 | 0.5 s | 2.0 s | 3.6 s | about 0.24 s + 3 ms per character |

By size, Gemini took 3.3 s at about 50 characters, 5.1 s at about 150 and 10.7 s at about 525. Speech plays at about
12 to 14 characters a second (about 79 ms a character at the tutor's 0.9 pace).

## Cause

1. **The gap: part 2 was much longer than part 1.** Part 1 was cut at 200 characters of whole sentences, so it was often
   one short sentence (about 60 characters, about 4.8 s of speech). Part 2 was cut at 600 characters (about 500 in
   practice), which Gemini takes about 10.6 s to make, and it was asked for only when part 1 started playing. So part 2
   was ready about 5.9 s after part 1 ended. The unit test `test/family/tutor-v21-audio.test.ts` reproduces this with
   the measured numbers and fake timers: before v21, 5.9 s of silence after part 1. When part 1 was a full 200 characters
   (about 15 s of speech), part 2 was just in time at p50 and late at p90 (10 s+): the 1 to 2 s gaps.
2. **The click: a new `<audio>` per part, routed after it started.** Each part made a new `Audio` element and, in its
   `playing` event, called `createMediaElementSource` to feed the tutor's mouth. That moved the sound from the speaker to
   the Web Audio graph while it was already playing (a jump in the signal), and each part started at full level with no
   ramp. A media element can be given to `createMediaElementSource` only once, so a new element per part also meant a new
   source node per part, never released, for the whole visit.

## Fix

- Parts: the first stays at 200 characters (fast first sound: about 3.5 s); the rest are cut at 350
  (`ANSWER_NEXT_MAX`, `answerParts` in `src/lib/family/call.ts`), so the next part (2.5 s + 16 ms x 350 = about 8 s) is
  ready before a short first part ends.
- Two parts ahead: part 2 is asked together with part 1, and while part k plays, parts k+1 and k+2 are asked for. In the
  test the gaps are 0 ms.
- One `<audio>` element for the visit, made in the child's tap (Ask), routed into the analyser once, through a gain node
  that fades each part in and out over 40 ms.
- Blocked start (`NotAllowedError`): the answer's top button pulses (off under reduced motion), no error, the server voice
  stays on.

## Measuring on a phone

Each part's request time, the server's generation time (`Server-Timing: tts;dur=`), its length and the silence before it
are logged in the browser console as `[voice]` in development, or on any phone after
`localStorage.setItem('fam:voice-debug', '1')`. The speak route logs `[voice] tts` once per request (genMs) in
development or with `FAMILY_VOICE_TIMING=1`. The words are never logged.
