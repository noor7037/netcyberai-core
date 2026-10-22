// The pictures the English course may use (docs/family-app/12 §10): emoji from Unicode 12 or earlier, so they show on
// older Android phones, plus a few drawings of our own for things no such emoji shows (`OWN_PICTURES`). The lesson
// checker (course.ts) refuses any other picture. Grouped by theme so a lesson writer can find one.

const GROUPS: Record<string, string> = {
  people: '👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👨‍🌾 👩‍🌾 👨‍🏫 👩‍🏫 👨‍⚕️ 👩‍⚕️ 👨‍🍳 👩‍🍳 👮 👷 💂 🧕 👳 🙋 🙋‍♀️ 🙋‍♂️ 🙇 🤷 🙌 👪 👫 👬 👭 🧍 🧎 🏃 🚶 💃 🕺 🤸 🧘',
  faces: '😀 😃 😄 😁 😊 🙂 😉 😍 🤗 🤔 😐 😮 😲 😢 😭 😠 😡 😴 🥱 😋 🤒 🤧 😷 🥵 🥶 😨 😳 🥳 😎 🤩 😇',
  body: '👀 👁️ 👂 👃 👄 👅 🦷 👋 👍 👎 👏 ✋ 🤚 🖐️ ✌️ 🤞 👌 👆 👇 👉 👈 ✊ 👊 🙏 💪 🦵 🦶 🧠 ❤️',
  animals: '🐄 🐃 🐂 🐐 🐑 🐖 🐔 🐓 🐣 🐤 🦆 🐕 🐶 🐈 🐱 🐎 🐴 🐪 🐘 🐒 🐵 🐅 🐯 🦁 🐻 🐼 🐇 🐰 🐁 🐭 🐿️ 🦜 🦚 🦉 🐦 🕊️ 🦅 🐟 🐠 🐢 🐍 🐸 🐊 🦋 🐝 🐜 🐞 🕷️ 🐌 🦀 🐬 🐳 🦒 🦓 🦔 🦥',
  plants: '🌳 🌲 🌴 🌵 🌱 🌿 🍀 🍃 🍂 🍁 🌾 🌻 🌼 🌸 🌺 🌹 🌷 💐',
  food: '🥭 🍌 🍎 🍏 🍊 🍋 🍇 🍉 🍐 🍑 🍒 🍓 🥥 🍍 🥝 🍅 🥕 🌽 🥔 🧅 🧄 🥒 🥬 🥦 🍆 🌶️ 🥜 🍚 🍛 🍲 🥣 🥗 🍞 🥚 🍳 🧀 🥛 🍵 ☕ 🍯 🧂 🍬 🍭 🍫 🍦 🍰 🎂 🥤 💧 🍽️ 🥄 🍴',
  home: '🏠 🏡 🏘️ 🚪 🛏️ 🪑 🛋️ 🚿 🛁 🚽 🧹 🧺 🧼 🔑 💡 🕯️ 🪔 📺 📻 📱 ☎️ ⏰ 🕰️ 👕 👖 👗 🥻 🧥 🧣 🧤 🧦 👟 👞 👡 🧢 👒 🎒 👓 🌂 ☂️',
  school: '🏫 📚 📖 📕 📗 📘 📙 📓 📒 📝 ✏️ ✒️ 🖊️ 🖍️ 📏 📐 ✂️ 📎 🗂️ 📅 📆 🔔 🧮 🖥️ 💻 🎨 🖌️ 🏆 🥇 🎓 🧪 🔬 🔭 🗺️ 🌍 🌏 ⚽ 🏏 🏸 🏑 🏀 🎯 🪀 🪁 🎲 🧩',
  places: '🏪 🏬 🏥 🏦 🏤 🏛️ 🛕 🕌 ⛪ 🛤️ 🛣️ 🌉 🏞️ 🏔️ ⛰️ 🏕️ 🏖️ 🏝️ 🌊 🏙️ 🌆 🏭 ⛲ 🎡 🎪',
  travel: '🚲 🛵 🏍️ 🛺 🚗 🚕 🚌 🚎 🚑 🚒 🚓 🚚 🚜 🚂 🚆 🚉 🚢 ⛵ 🛶 ✈️ 🚁 🚦 🛑 ⛽ 🎫',
  weather: '☀️ 🌞 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌈 ❄️ ⛄ 🌬️ 🌪️ 🌫️ 💨 🔥 🌙 🌛 ⭐ 🌟 ✨ ⚡ 🌡️',
  things: '🎁 🎈 🎉 🎊 🎵 🎶 🎤 🎧 🥁 🪕 🎸 🎺 📷 🔦 🧸 🛒 💰 💵 💳 ⚖️ 🔨 🪓 ⛏️ 🧰 🧲 🧵 🧶 ✉️ 📨 📦 🏷️ 🩹 🩺 💊 💉 🌡️ 🧴 🕶️ ⌚ 🎗️ 🚩 🏳️ 🇮🇳',
  symbols: '✅ ❓ ❗ ➕ ➖ ✖️ ➗ 🔢 🔤 🆗 🆕 💯 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔷 🔶 ⬛ ⬜ 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⭕ 🔲 ⏳ ⌛ ▶️ ⏸️ 🔁 ➡️ ⬅️ ⬆️ ⬇️ ↩️ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟',
};

// Drawings of our own (src/components/family/english/OwnPicture.tsx), named in a lesson as "own:<name>".
export const OWN_PICTURES = ['roti', 'chalkboard', 'well', 'tiffin', 'school-bus', 'haat', 'kite-festival', 'rangoli'] as const;
export type OwnPicture = (typeof OWN_PICTURES)[number];

export const COURSE_EMOJI: ReadonlySet<string> = new Set(
  Object.values(GROUPS)
    .flatMap((g) => g.split(' '))
    .filter((e) => e.length > 0)
);

// A picture in a lesson: one allowed emoji, or "own:<name>".
export function isCoursePicture(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  if (v.startsWith('own:')) return (OWN_PICTURES as readonly string[]).includes(v.slice(4));
  return COURSE_EMOJI.has(v);
}

export const EMOJI_GROUPS = GROUPS;
