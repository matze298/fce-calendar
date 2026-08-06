/** Expanded before diacritics are stripped, otherwise "ü" would degrade to "u". */
const GERMAN_TRANSLITERATIONS: [RegExp, string][] = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
];

/**
 * A name reduced to a comparable form: lowercased, German characters expanded, remaining
 * diacritics dropped, punctuation treated as a token boundary, and tokens sorted so that
 * "Müller, Thomas" and "Thomas Mueller" come out identical.
 */
export function normalizeName(name: string): string {
  let value = name.toLowerCase();

  for (const [pattern, replacement] of GERMAN_TRANSLITERATIONS) {
    value = value.replace(pattern, replacement);
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}
