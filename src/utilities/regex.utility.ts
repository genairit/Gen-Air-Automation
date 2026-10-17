const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\/]/g;

export const escapeRegex = (text: string): string => text.replace(REGEX_SPECIAL_CHARACTERS, "\\$&");

export const buildPrefixPattern = (prefix: string): RegExp =>
  new RegExp(`^${escapeRegex(prefix)} `);
