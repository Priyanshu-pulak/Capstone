const INLINE_LATEX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\\[/g, '$$'],
  [/\\\]/g, '$$'],
  [/\\\(/g, '$'],
  [/\\\)/g, '$'],
  [/\$\\rightarrow\$/g, '→'],
  [/\$\\to\$/g, '→'],
  [/\$\\leftarrow\$/g, '←'],
  [/\$\\Rightarrow\$/g, '⇒'],
  [/\$\\Leftarrow\$/g, '⇐'],
  [/\$\\leftrightarrow\$/g, '↔'],
];

export function toDisplayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function toDisplayTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => toDisplayText(item).trim())
    .filter(Boolean);
}

export function normalizeMarkdownText(text: unknown): string {
  return INLINE_LATEX_REPLACEMENTS.reduce(
    (normalizedText, [pattern, replacement]) =>
      normalizedText.replace(pattern, replacement),
    toDisplayText(text),
  );
}
