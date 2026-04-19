const INLINE_LATEX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\$\\rightarrow\$/g, '→'],
  [/\$\\to\$/g, '→'],
  [/\$\\leftarrow\$/g, '←'],
  [/\$\\Rightarrow\$/g, '⇒'],
  [/\$\\Leftarrow\$/g, '⇐'],
  [/\$\\leftrightarrow\$/g, '↔'],
];

export function normalizeMarkdownText(text: string): string {
  return INLINE_LATEX_REPLACEMENTS.reduce(
    (normalizedText, [pattern, replacement]) =>
      normalizedText.replace(pattern, replacement),
    text,
  );
}
