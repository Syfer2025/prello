/**
 * Acesso controlado ao layout REAL renderizado pelo @hufe921/canvas-editor.
 *
 * O editor desenha cada página num <canvas> a partir de um `Draw` interno que
 * NÃO é exposto pela API pública (o `Editor` só guarda `command`/`listener`/…,
 * e `Command` apenas faz `bind` dos métodos do adapter). Para exportar um PDF
 * VETORIAL 1:1 com a tela — e para refinar a justificação — precisamos do
 * `positionList`/`elementList` que o motor do canvas já computou.
 *
 * Estratégia: capturamos o `Draw` durante a construção do editor interceptando
 * `Function.prototype.bind` por uma janela mínima e síncrona (restaurada no
 * finally). O `CommandAdapt` faz `adapt.metodo.bind(adapt)` dezenas de vezes;
 * `adapt.draw` é o `Draw`. Identificamos o adapter pela presença de
 * `draw.getOriginalMainElementList` + `draw.getPosition`. Se a captura falhar
 * (ex.: versão futura mudou o wiring), `draw` volta `null` e o chamador cai no
 * caminho de fallback — nada quebra o editor.
 *
 * Pinado em @hufe921/canvas-editor@0.9.136.
 */

/** Subconjunto mínimo do `Draw` interno que consumimos. Tipagem estrutural. */
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
  getRange?(): {
    getRange(): { startIndex: number; endIndex: number };
    setRange(startIndex: number, endIndex: number): void;
  };
  computeRowList?(payload: unknown): unknown[];
  render(payload?: unknown): void;
}

interface AdaptLike {
  draw?: CanvasDrawInternal;
}

function looksLikeDraw(value: unknown): value is CanvasDrawInternal {
  if (!value || typeof value !== 'object') return false;
  const draw = value as Record<string, unknown>;
  return (
    typeof draw.getOriginalMainElementList === 'function' &&
    typeof draw.getPosition === 'function' &&
    typeof draw.getOptions === 'function'
  );
}

/**
 * Executa `factory()` (tipicamente `() => new Editor(...)`) capturando o `Draw`
 * interno. Restaura `Function.prototype.bind` imediatamente.
 */
export function captureDrawDuring<T>(factory: () => T): { result: T; draw: CanvasDrawInternal | null } {
  let captured: CanvasDrawInternal | null = null;
  const FnProto = Function.prototype as unknown as { bind: typeof Function.prototype.bind };
  const originalBind = FnProto.bind;

  FnProto.bind = function patchedBind(this: unknown, thisArg: unknown, ...rest: unknown[]) {
    if (!captured) {
      const adapt = thisArg as AdaptLike | null;
      if (adapt && typeof adapt === 'object' && looksLikeDraw(adapt.draw)) {
        captured = adapt.draw!;
      }
    }
    return (originalBind as (this: unknown, thisArg: unknown, ...args: unknown[]) => unknown).call(
      this,
      thisArg,
      ...rest
    );
  } as typeof Function.prototype.bind;

  try {
    const result = factory();
    return { result, draw: captured };
  } finally {
    FnProto.bind = originalBind;
  }
}
