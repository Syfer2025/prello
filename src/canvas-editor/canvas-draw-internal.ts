/** Subconjunto mínimo do `Draw` vendorizado que o Prelo consome. */
export interface CanvasDrawInternal {
  getOriginalMainElementList(): unknown[];
  getOriginalWidth(): number;
  getOriginalHeight(): number;
  getWidth(): number;
  getHeight(): number;
  getInnerWidth(): number;
  getMargins(): number[];
  getPageGap(): number;
  getOptions(): Record<string, unknown>;
  getPosition(): {
    getPositionList(): unknown[];
    getOriginalPositionList(): unknown[];
    getMainPositionList?(): unknown[];
  };
  getRowList(): unknown[];
  /** Canvases das páginas renderizadas, em ordem (API pública do Draw vendorizado). */
  getPageList(): HTMLCanvasElement[];
  getRange?(): {
    getRange(): { startIndex: number; endIndex: number };
    setRange(startIndex: number, endIndex: number): void;
  };
  computeRowList?(payload: unknown): unknown[];
  /**
   * Registra um hook oficial que roda no fim de `computeRowList` (recurso do
   * editor vendorizado). É como o Prelo aplica justificação/recuo SEM substituir
   * o método. `null` remove o hook.
   */
  setComputeRowListHook?(
    hook: ((rowList: unknown[], payload: unknown) => void) | null
  ): void;
  render(payload?: unknown): void;
}
