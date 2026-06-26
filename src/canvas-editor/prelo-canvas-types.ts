export interface PreloCanvasMarginsMm {
  readonly top: number;
  readonly bottom: number;
  readonly inside: number;
  readonly outside: number;
}

export interface PreloCanvasBookPreset {
  readonly id: string;
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly marginsMm: PreloCanvasMarginsMm;
}

export interface PreloCanvasProject {
  id: string;
  name: string;
  bookLayout: unknown;
  data: unknown;
  savedAtIso: string;
}
