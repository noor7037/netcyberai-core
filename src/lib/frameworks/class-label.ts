// "5" + "A" is "5-A"; a class already named "5-A" stays "5-A".
export function classLabel(name: string | null, section: string | null): string | null {
  if (!name) return null;
  return section && !name.toUpperCase().endsWith(section.toUpperCase()) ? `${name}-${section}` : name;
}
