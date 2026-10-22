import { colors as C, deepColors as D } from '@/lib/design-tokens';
import type { Scene } from '@/lib/family/english/course';
import { Picture } from '../Picture';

// The course's pictures (docs/family-app/12 §10): an allowed emoji, or one of our own small drawings ("own:<name>"),
// and scenes built from them in an SVG frame. An emoji is drawn from the bundled picture set (D1, C290), so every phone
// shows the same picture.

function OwnPicture({ name, size }: { name: string; size: number | string }) {
  const s = { width: size, height: size };
  switch (name) {
    case 'roti':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <circle cx="20" cy="20" r="17" fill={C.peach} stroke={D.tangerineDeep} strokeWidth="2" />
          <circle cx="13" cy="15" r="2.5" fill={D.goldDeep} />
          <circle cx="24" cy="12" r="2" fill={D.goldDeep} />
          <circle cx="27" cy="25" r="3" fill={D.goldDeep} />
          <circle cx="15" cy="27" r="2" fill={D.goldDeep} />
        </svg>
      );
    case 'chalkboard':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect x="3" y="6" width="34" height="24" rx="2" fill={C.emerald} stroke={D.goldDeep} strokeWidth="3" />
          <path d="M9 14h14M9 20h20" stroke={C.offWhite} strokeWidth="2" strokeLinecap="round" />
          <path d="M10 30l-3 7M30 30l3 7" stroke={D.goldDeep} strokeWidth="3" />
        </svg>
      );
    case 'well':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <path d="M8 4h24M12 4v12M28 4v12M20 4v14" stroke={D.goldDeep} strokeWidth="3" />
          <rect x="17" y="16" width="6" height="5" fill={C.azure} />
          <ellipse cx="20" cy="24" rx="14" ry="4" fill={`${C.slate}55`} />
          <rect x="6" y="24" width="28" height="12" fill={`${C.slate}55`} />
          <path d="M6 30h28" stroke={`${C.slate}99`} strokeWidth="1.5" />
        </svg>
      );
    case 'tiffin':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <path d="M14 6a6 6 0 0 1 12 0" stroke={`${C.slate}99`} strokeWidth="3" fill="none" />
          {[8, 17, 26].map((y) => (
            <rect key={y} x="9" y={y} width="22" height="8" rx="2" fill={`${C.slate}33`} stroke={`${C.slate}99`} strokeWidth="1.5" />
          ))}
        </svg>
      );
    case 'school-bus':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect x="3" y="10" width="34" height="18" rx="3" fill={C.gold} />
          {[7, 15, 23].map((x) => (
            <rect key={x} x={x} y="13" width="6" height="6" rx="1" fill={C.offWhite} />
          ))}
          <rect x="30" y="13" width="5" height="11" rx="1" fill={C.offWhite} />
          <circle cx="11" cy="30" r="4" fill={C.slate} />
          <circle cx="29" cy="30" r="4" fill={C.slate} />
        </svg>
      );
    case 'haat':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <path d="M4 16l16-10 16 10z" fill={C.tangerine} />
          <rect x="7" y="16" width="26" height="4" fill={D.tangerineDeep} />
          <rect x="9" y="20" width="22" height="14" fill={C.sunshine} />
          <circle cx="15" cy="27" r="3" fill={C.leaf} />
          <circle cx="23" cy="27" r="3" fill={C.coral} />
        </svg>
      );
    case 'kite-festival':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <path d="M14 4l8 8-8 8-8-8z" fill={C.coral} />
          <path d="M28 10l7 7-7 7-7-7z" fill={C.grape} />
          <path d="M14 20q2 8 -4 16M28 24q-2 6 4 12" stroke={C.slate} strokeWidth="1" fill="none" />
        </svg>
      );
    case 'rangoli':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <circle cx="20" cy="20" r="17" fill={C.sunshine} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <ellipse key={a} cx="20" cy="9" rx="4" ry="7" fill={a % 90 === 0 ? C.coral : C.grape} transform={`rotate(${a} 20 20)`} />
          ))}
          <circle cx="20" cy="20" r="5" fill={C.turquoise} />
        </svg>
      );
    default:
      return null;
  }
}

// A picture's name for a screen reader: the emoji itself (read out by its name), or our drawing's name.
export const picName = (pic?: string) => (pic ? (pic.startsWith('own:') ? pic.slice(4).replace(/-/g, ' ') : pic) : '');

// One picture. `size` in pixels.
export function Pic({ pic, size = 40, className = '' }: { pic?: string; size?: number | string; className?: string }) {
  if (!pic) return null;
  if (pic.startsWith('own:')) {
    return (
      <span className={`inline-flex items-center justify-center ${className}`}>
        <OwnPicture name={pic.slice(4)} size={size} />
      </span>
    );
  }
  return <Picture e={pic} size={size} className={className} />;
}

// A scene's sky and ground, by place, from the design tokens' hues.
const PLACES: Record<Scene['place'], [string, string]> = {
  home: [`${C.peach}40`, `${C.peach}`],
  school: [`${C.cyan}26`, `${C.leaf}80`],
  market: [`${C.sunshine}26`, `${C.tangerine}66`],
  field: [`${C.cyan}26`, `${C.leaf}99`],
  village: [`${C.cyan}33`, `${C.leaf}80`],
  clinic: [`${C.turquoise}1a`, `${C.turquoise}66`],
  station: [`${C.royal}14`, `${C.slate}33`],
  road: [`${C.cyan}26`, `${C.slate}40`],
  festival: [`${C.sunshine}40`, `${C.coral}66`],
  plain: [C.offWhite, `${C.slate}1a`],
};

// A scene: the pictures placed on a 100 × 60 grid; they pop in one after another (still under reduced motion).
export function SceneView({ scene, label, className = '' }: { scene: Scene; label?: string; className?: string }) {
  const [sky, ground] = PLACES[scene.place] ?? PLACES.plain;
  return (
    <div role={label ? 'img' : undefined} aria-label={label} className={`relative w-full overflow-hidden rounded-3xl ring-1 ring-slate/10 ${className}`} style={{ aspectRatio: '100 / 60', background: ground, containerType: 'inline-size' }}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-3/5" style={{ background: sky }} />
      {scene.pics.map((p, i) => (
        <span
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 animate-pop-in motion-reduce:animate-none"
          style={{ left: `${p.x}%`, top: `${(p.y / 60) * 100}%`, animationDelay: `${i * 90}ms`, animationFillMode: 'both' }}
        >
          {/* Pictures grow with the scene (container units): about a tenth of its width at size 1. */}
          <Pic pic={p.pic} size={`clamp(28px, ${(9 * (p.size ?? 1)).toFixed(1)}cqw, 140px)`} />
        </span>
      ))}
    </div>
  );
}
