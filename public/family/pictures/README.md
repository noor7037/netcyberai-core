# The Family app's pictures (D1, Decision Log C290)

Every phone shows the same pictures: these files replace the device's own emoji in the Family app.

- **Fluent Emoji, flat style** by Microsoft (https://github.com/microsoft/fluentui-emoji), MIT licence (`LICENSE` in
  this folder). Copied unchanged except that XML comments and declarations are removed; a file with a script, an event
  handler, a foreign object or an outside link is refused by the import.
- **Drawn for NetCyberAI** in the same style, where Fluent has no picture: `1f1ee-1f1f3.svg` (India's flag: saffron,
  white and green bands at 3:2 with the navy Ashoka Chakra of 24 spokes), `1f46a.svg`, `1f46b.svg`, `1f46c.svg`,
  `1f46d.svg` (people together).

A file is named by the emoji's code points in hex without the variation selector FE0F, joined by `-`
(`src/lib/family/pictures.ts`).
