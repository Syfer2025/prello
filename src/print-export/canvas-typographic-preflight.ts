import type { CanvasLayoutImage, CanvasLayoutSnapshot } from './canvas-vector-types';
import {
  average,
  buildLayoutLines,
  collapseWhitespace,
  endsWithHyphen,
  estimateBodyMeasureByPage,
  isJustifiedLine,
  wordCount,
  type LayoutLine,
} from './canvas-layout-lines';
import {
  scoreCanvasComposition,
  type CanvasCompositionScore,
  type CanvasCompositionScoreOptions,
} from './canvas-composition-score';

export type TypographicIssueType =
  | 'looseJustifiedLine'
  | 'hyphenLadder'
  | 'pageBottomHyphen'
  | 'imageWrapNarrowLine';

export type TypographicPreflightSeverity = 'warning' | 'blocking';
export type TypographicPreflightStatus = 'ok' | 'warning' | 'blocked';

export interface TypographicPreflightIssue {
  id: string;
  type: TypographicIssueType;
  severity: TypographicPreflightSeverity;
  pageNo: number;
  lineNo: number;
  yTop: number;
  lineText: string;
  message: string;
  detail: string;
}

export interface TypographicPreflightReport {
  status: TypographicPreflightStatus;
  issues: TypographicPreflightIssue[];
  warningCount: number;
  blockingCount: number;
  pageCount: number;
  checkedLineCount: number;
  /** Diagnóstico contínuo de composição (score 0..100 + métricas + ofensores). */
  composition: CanvasCompositionScore;
}

export interface TypographicPreflightOptions {
  /** Espaço médio entre palavras acima deste valor em em vira alerta. */
  looseSpaceEmThreshold?: number;
  /** Espaço máximo entre palavras acima deste valor em em vira alerta. */
  looseMaxSpaceEmThreshold?: number;
  /** Limite editorial de linhas seguidas terminando em hífen. */
  maxConsecutiveHyphenatedLines?: number;
  /** Linha ao lado de imagem menor que esta fração da medida de texto vira alerta. */
  imageWrapNarrowLineRatio?: number;
  /** Opções repassadas ao score de composição. */
  composition?: CanvasCompositionScoreOptions;
}

const DEFAULT_LOOSE_SPACE_EM = 0.82;
const DEFAULT_LOOSE_MAX_SPACE_EM = 1.15;
const DEFAULT_MAX_CONSECUTIVE_HYPHENS = 2;
const DEFAULT_IMAGE_WRAP_NARROW_RATIO = 0.48;

export function analyzeCanvasTypography(
  snapshot: CanvasLayoutSnapshot,
  options: TypographicPreflightOptions = {}
): TypographicPreflightReport {
  const lines = buildLayoutLines(snapshot.glyphs);
  const issues: TypographicPreflightIssue[] = [];
  const emit = createIssueEmitter(issues);

  const looseSpaceEmThreshold = options.looseSpaceEmThreshold ?? DEFAULT_LOOSE_SPACE_EM;
  const looseMaxSpaceEmThreshold = options.looseMaxSpaceEmThreshold ?? DEFAULT_LOOSE_MAX_SPACE_EM;
  const maxConsecutiveHyphenatedLines =
    options.maxConsecutiveHyphenatedLines ?? DEFAULT_MAX_CONSECUTIVE_HYPHENS;
  const imageWrapNarrowLineRatio =
    options.imageWrapNarrowLineRatio ?? DEFAULT_IMAGE_WRAP_NARROW_RATIO;

  for (const line of lines) {
    if (!isJustifiedLine(line)) continue;
    if (line.wordSpaceWidths.length < 2) continue;
    const avgSpace = average(line.wordSpaceWidths);
    const maxSpace = Math.max(...line.wordSpaceWidths);
    const avgEm = avgSpace / line.fontSizePx;
    const maxEm = maxSpace / line.fontSizePx;
    if (avgEm < looseSpaceEmThreshold && maxEm < looseMaxSpaceEmThreshold) continue;

    emit(line, 'looseJustifiedLine', {
      message: 'Linha justificada com espaços muito abertos.',
      detail:
        `Espaço médio ${avgSpace.toFixed(1)} px (${avgEm.toFixed(2)} em), ` +
        `máximo ${maxSpace.toFixed(1)} px (${maxEm.toFixed(2)} em).`,
    });
  }

  flagHyphenLadders(lines, maxConsecutiveHyphenatedLines, emit);
  flagPageBottomHyphens(lines, emit);
  flagNarrowImageWrapLines(
    lines,
    snapshot.images ?? [],
    imageWrapNarrowLineRatio,
    emit
  );

  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const blockingCount = issues.filter((issue) => issue.severity === 'blocking').length;
  return {
    status: blockingCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'ok',
    issues,
    warningCount,
    blockingCount,
    pageCount: snapshot.pageCount,
    checkedLineCount: lines.length,
    composition: scoreCanvasComposition(snapshot, options.composition),
  };
}

function createIssueEmitter(issues: TypographicPreflightIssue[]) {
  const seen = new Set<string>();
  return (
    line: LayoutLine,
    type: TypographicIssueType,
    issue: Pick<TypographicPreflightIssue, 'message' | 'detail'> & {
      severity?: TypographicPreflightSeverity;
    }
  ) => {
    const id = `${type}:p${line.pageNo}:l${line.lineNo}`;
    if (seen.has(id)) return;
    seen.add(id);
    issues.push({
      id,
      type,
      severity: issue.severity ?? 'warning',
      pageNo: line.pageNo,
      lineNo: line.lineNo,
      yTop: Math.round(line.yTop * 10) / 10,
      lineText: collapseWhitespace(line.trimmedText),
      message: issue.message,
      detail: issue.detail,
    });
  };
}

function flagHyphenLadders(
  lines: LayoutLine[],
  maxConsecutiveHyphenatedLines: number,
  emit: ReturnType<typeof createIssueEmitter>
) {
  let run: LayoutLine[] = [];
  let currentPageIndex: number | null = null;
  for (const line of lines) {
    if (currentPageIndex !== line.pageIndex) {
      run = [];
      currentPageIndex = line.pageIndex;
    }
    if (!endsWithHyphen(line)) {
      run = [];
      continue;
    }
    run.push(line);
    if (run.length <= maxConsecutiveHyphenatedLines) continue;
    emit(line, 'hyphenLadder', {
      message: 'Escada de hifens no bloco de texto.',
      detail:
        `${run.length} linhas seguidas terminam com hífen; ` +
        `limite recomendado: ${maxConsecutiveHyphenatedLines}.`,
    });
  }
}

function flagPageBottomHyphens(
  lines: LayoutLine[],
  emit: ReturnType<typeof createIssueEmitter>
) {
  const lastByPage = new Map<number, LayoutLine>();
  for (const line of lines) {
    if (!line.trimmedText) continue;
    lastByPage.set(line.pageIndex, line);
  }

  for (const line of lastByPage.values()) {
    if (!endsWithHyphen(line)) continue;
    emit(line, 'pageBottomHyphen', {
      message: 'Página termina com palavra hifenizada.',
      detail: 'Evite fechar a última linha da página com hífen quando houver alternativa editorial.',
    });
  }
}

function flagNarrowImageWrapLines(
  lines: LayoutLine[],
  images: CanvasLayoutImage[],
  ratio: number,
  emit: ReturnType<typeof createIssueEmitter>
) {
  if (images.length === 0) return;

  const measureByPage = estimateBodyMeasureByPage(lines);
  for (const line of lines) {
    if (wordCount(line.trimmedText) < 2) continue;
    const bodyMeasure = measureByPage.get(line.pageIndex);
    if (!bodyMeasure || line.widthPx >= bodyMeasure * ratio) continue;
    const overlapsImage = images.some((image) => lineOverlapsImage(line, image));
    if (!overlapsImage) continue;

    emit(line, 'imageWrapNarrowLine', {
      message: 'Linha muito estreita ao redor de imagem.',
      detail:
        `A linha usa ${Math.round(line.widthPx)} px de uma medida típica de ` +
        `${Math.round(bodyMeasure)} px. Ajuste contorno, imagem ou quebra de parágrafo.`,
    });
  }
}

function lineOverlapsImage(line: LayoutLine, image: CanvasLayoutImage): boolean {
  if (line.pageIndex !== image.pageNo) return false;
  const imageBottom = image.yTop + image.height;
  const verticalOverlap = line.yTop < imageBottom && line.yBottom > image.yTop;
  if (!verticalOverlap) return false;

  const imageRight = image.x + image.width;
  const imageMid = image.x + image.width / 2;
  const lineHasImageBesideIt =
    line.xMin >= imageMid ||
    line.xMax <= imageMid ||
    (line.xMin >= image.x && line.xMax >= imageRight);
  return lineHasImageBesideIt;
}
