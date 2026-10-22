// The Family app's motion (docs/family-app/09 §3; D1, C292): transforms and opacity only, short, and none under reduced
// motion. One set of class strings, so press, lift and entrance feel the same on every screen.

// A tap: the control sinks a little while pressed.
export const PRESS = 'transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100';
// A card that can be opened lifts on hover (a mouse or a pen; phones show PRESS).
export const LIFT = 'transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0';
// A section arriving: rises and fades in, once.
export const ENTER = 'animate-rise-in motion-reduce:animate-none';
