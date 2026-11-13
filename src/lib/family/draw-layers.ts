// The art table's layers (C513), bottom to top: the paper (its grain and lines), the drawing (every line, fill, label and
// stuck-down sticker), the stickers still loose (objects the child moves, turns and resizes until "Stick"), and the
// template's outline, on top so its lines stay visible after colouring. No layer panel: this is the whole idea. The
// outline is never a target: the eraser and Clear work on the drawing (and Clear lets go of loose stickers), so a
// template's lines survive both. A picture saved or sent is the paper, the drawing and the outline, in that order.

export const LAYERS = ['paper', 'drawing', 'stickers', 'outline'] as const;
export type Layer = (typeof LAYERS)[number];

export type LayerAction = 'ink' | 'erase' | 'shape' | 'fill' | 'text' | 'label' | 'stick' | 'clear' | 'paper';
// What each action changes. Nothing changes the outline.
export function layersTouched(action: LayerAction): Layer[] {
  switch (action) {
    case 'paper':
      return ['paper'];
    case 'stick':
      return ['drawing', 'stickers'];
    case 'clear':
      return ['drawing', 'stickers'];
    default:
      return ['drawing'];
  }
}

// The picture's layers, bottom to top (loose stickers are stuck down first, so they are part of the drawing).
export const exportLayers = (hasOutline: boolean): Layer[] => (hasOutline ? ['paper', 'drawing', 'outline'] : ['paper', 'drawing']);
