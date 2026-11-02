import type { Board } from '@/lib/family/blocks';

// W16-A2: a board that uses every command kind and every shape, as the checker gives it back (made-up content; the
// same drawing is in the harness seed, src/demo-fixture/harness-seed.sql, topic ch90.t12).
export const BOARD: Board = {
  type: 'board',
  title: 'Water presses harder lower down',
  steps: [
    {
      n: 1,
      say: 'A liquid presses on the walls of its container.',
      commands: [
        { id: 'bottle', kind: 'shape', shape: 'rect', at: [10, 15], w: 30, h: 72, colour: 'teal', fill: true },
        { kind: 'shape', shape: 'line', from: [10, 22], to: [40, 22], dashed: true, colour: 'teal' },
        { kind: 'group', id: 'top', colour: 'plum', commands: [{ kind: 'shape', shape: 'triangle', points: [[18, 2], [32, 2], [25, 9]] }, { kind: 'shape', shape: 'ellipse', at: [25, 13], rx: 9, ry: 2 }] },
        { kind: 'label', at: [13, 52], text: 'Water' },
      ],
    },
    {
      n: 2,
      say: 'Make three holes in its side, one above the other.',
      commands: [
        { id: 'h1', kind: 'point', at: [40, 40] },
        { id: 'h2', kind: 'point', at: [40, 58] },
        { id: 'h3', kind: 'point', at: [40, 76], label: 'Lowest' },
        { id: 'guess', kind: 'text', at: [4, 97], text: 'Which jet goes farthest?', size: 'small' },
      ],
    },
    {
      n: 3,
      say: 'Water from the lowest hole spurts out the farthest.',
      commands: [
        { kind: 'arrow', from: [41, 40], to: [50, 44], colour: 'teal' },
        { kind: 'arrow', from: [41, 58], to: [58, 64], colour: 'teal' },
        { kind: 'arrow', from: [41, 76], to: [66, 84], colour: 'teal' },
        { kind: 'highlight', target: 'h3' },
      ],
    },
    {
      n: 4,
      say: 'So the pressure of a liquid increases with depth.',
      commands: [
        { kind: 'erase', target: 'guess' },
        { id: 'ax', kind: 'axis', at: [58, 48], w: 36, h: 34, x: [0, 5], y: [0, 50], xLabel: 'Depth (m)', yLabel: 'kPa', colour: 'plum' },
        { kind: 'graph', axis: 'ax', points: [[0, 0], [5, 49]], colour: 'saffron' },
        { kind: 'shape', shape: 'circle', at: [94, 14], r: 1.5, colour: 'saffron' },
        { kind: 'equation', at: [62, 66], text: 'P = F / A' },
      ],
    },
  ],
};
