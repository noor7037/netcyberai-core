'use client';

import { WHEEL, WHEEL_HUES, WHEEL_TONES, hueColour, toneColours, wheelSpot, type WheelHit } from '@/lib/family/draw-geometry';
import type { Point } from '@/lib/family/sketch';

// The radial colour wheel (C513), opened by a long press on the paper or on the Colours block, under the finger: the
// outer ring is twelve hues, the next ring the tints and shades of the hue last touched, the inner petals the template's
// own colours (or the child's recent ones), the middle lets go without choosing. The finger slides to a colour and lifts
// to take it; the geometry is src/lib/family/draw-geometry.ts. Pointer only: keyboards and screen readers use the
// palette list, so the wheel is hidden from them.

type Props = { centre: Point; petals: readonly string[]; toneHue: number; hover: WheelHit; current: string };

const ringR = (inner: number, outer: number) => (inner + outer) / 2;

export function RadialPicker({ centre, petals, toneHue, hover, current }: Props) {
  const size = (WHEEL.hues + 8) * 2;
  const c = size / 2;
  const tones = toneColours(toneHue);
  const on = (ring: WheelHit['ring'], i: number) => hover.ring === ring && 'index' in hover && hover.index === i;
  const dot = (key: string, at: Point, r: number, hex: string, lit: boolean) => (
    <circle key={key} cx={c + at.x} cy={c + at.y} r={lit ? r + 5 : r} fill={hex} stroke={lit ? '#1C1B1A' : '#FFFFFF'} strokeWidth={lit ? 4 : 2.5} />
  );
  return (
    <div aria-hidden="true" data-draw-wheel className="pointer-events-none fixed z-[60]" style={{ left: centre.x - c, top: centre.y - c, width: size, height: size }}>
      <svg viewBox={[0, 0, size, size].join(' ')} width={size} height={size} className="draw-wheel drop-shadow-xl">
        <circle cx={c} cy={c} r={WHEEL.hues + 6} fill="#FFFCF6" stroke="rgba(28,27,26,0.12)" />
        {Array.from({ length: WHEEL_HUES }, (_, i) => dot(`h${i}`, wheelSpot(i, WHEEL_HUES, ringR(WHEEL.tones, WHEEL.hues)), 15, hueColour(i), on('hue', i)))}
        {WHEEL_TONES.map((_, i) => dot(`t${i}`, wheelSpot(i, WHEEL_TONES.length, ringR(WHEEL.petals, WHEEL.tones)), 14, tones[i], on('tone', i)))}
        {petals.map((hex, i) => dot(`p${i}`, wheelSpot(i, petals.length, ringR(WHEEL.centre, WHEEL.petals)), 13, hex, on('petal', i)))}
        <circle cx={c} cy={c} r={WHEEL.centre - 6} fill={current} stroke={hover.ring === 'centre' ? '#1C1B1A' : '#FFFFFF'} strokeWidth={4} />
      </svg>
    </div>
  );
}

