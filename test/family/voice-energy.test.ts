import { describe, expect, it } from 'vitest';
import { EnergyMeter, MIN_LOUD_FRAMES, rms } from '@/lib/family/voice-energy';

// W17-B4: the phone measures the sound while it records and sends nothing when no voice was there. The recorder hook
// itself is not rendered here: jsdom has no AudioContext, so only the arithmetic is tested.

const sine = (amplitude: number, n = 2048) => Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin((2 * Math.PI * 10 * i) / n));
const quiet = () => new Float32Array(2048);

describe('rms', () => {
  it('is 0 for silence and for no samples', () => {
    expect(rms(quiet())).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });
  it('is amplitude over root two for a sine', () => {
    expect(rms(sine(0.1))).toBeCloseTo(0.0707, 3);
  });
});

describe('the energy meter', () => {
  it('hears no speech in all-quiet frames, room hiss included', () => {
    const m = new EnergyMeter();
    for (let i = 0; i < 50; i++) m.add(i % 2 ? quiet() : sine(0.005));
    expect(m.heardSpeech()).toBe(false);
    expect(m.loudFrames).toBe(0);
    expect(m.peak).toBeCloseTo(0.0035, 3);
  });
  it('hears speech after three loud frames', () => {
    const m = new EnergyMeter();
    for (let i = 0; i < MIN_LOUD_FRAMES - 1; i++) m.add(sine(0.1));
    expect(m.heardSpeech()).toBe(false);
    m.add(sine(0.1));
    expect(m.heardSpeech()).toBe(true);
    expect(m.loudFrames).toBe(MIN_LOUD_FRAMES);
    expect(m.peak).toBeCloseTo(0.0707, 3);
  });
  it('does not take one loud frame (a knock) for speech', () => {
    const m = new EnergyMeter();
    m.add(sine(0.5));
    for (let i = 0; i < 30; i++) m.add(quiet());
    expect(m.heardSpeech()).toBe(false);
    expect(m.loudFrames).toBe(1);
  });
});
