const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\/]/g;

export const escapeRegex = (text: string): string => text.replace(REGEX_SPECIAL_CHARACTERS, "\\$&");

export const buildPrefixPattern = (prefix: string): RegExp =>
  new RegExp(`^${escapeRegex(prefix)} `);

export const buildStartPattern = (prefix: string): RegExp => new RegExp(`^${escapeRegex(prefix)}`);

export const buildSequencePattern = (parts: string[]): RegExp =>
  new RegExp(`^${parts.map(escapeRegex).join("\\s*")}$`);
