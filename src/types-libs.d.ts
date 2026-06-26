declare module 'hypher' {
  export default class Hypher {
    constructor(pattern: unknown);
    hyphenate(word: string): string[];
    hyphenateText(text: string): string;
  }
}

declare module 'hyphenation.pt' {
  const pattern: unknown;
  export default pattern;
}
