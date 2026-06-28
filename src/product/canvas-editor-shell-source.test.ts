/// <reference types="node" />
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJsonSource = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
const appShellSource = readFileSync(join(process.cwd(), 'src/product/AppShell.tsx'), 'utf8');
const canvasShellSource = readFileSync(join(process.cwd(), 'src/product/CanvasEditorShell.tsx'), 'utf8');
const hostSource = readFileSync(join(process.cwd(), 'src/canvas-editor/CanvasEditorHost.tsx'), 'utf8');
const productCssSource = readFileSync(join(process.cwd(), 'src/product/product.css'), 'utf8');
const vendorIndexPath = join(process.cwd(), 'src/vendor/canvas-editor/index.ts');
const vendorEditorPath = join(process.cwd(), 'src/vendor/canvas-editor/editor/index.ts');
const vendorIndexSource = existsSync(vendorIndexPath) ? readFileSync(vendorIndexPath, 'utf8') : '';
const vendorEditorSource = existsSync(vendorEditorPath) ? readFileSync(vendorEditorPath, 'utf8') : '';

describe('canvas editor product integration', () => {
  it('uses CanvasEditorShell as the primary editor surface', () => {
    expect(appShellSource).toContain('CanvasEditorShell');
    expect(appShellSource).toContain(
      '<CanvasEditorShell onBack={handleBackToDashboard} onPersistProject={handlePersistActiveProject} />'
    );
    expect(appShellSource).not.toContain("from './EditorShell'");
    expect(appShellSource).not.toContain("from '../lab/MotorLab'");
    expect(appShellSource).not.toContain("type View = 'editor' | 'legacy' | 'lab'");
    expect(appShellSource).not.toContain('dev-tabs');
  });

  it('persists editor saves into the active dashboard project content key', () => {
    expect(appShellSource).toContain('handlePersistActiveProject');
    expect(appShellSource).toContain('persistProjectContent(window.localStorage, activeProjectId');
    expect(appShellSource).toContain('onPersistProject={handlePersistActiveProject}');
    expect(canvasShellSource).toContain('onPersistProject?: (serializedProject: string) => void');
    expect(canvasShellSource).toContain('onPersistProject?.(serializedProject)');
  });

  it('does not mark a project as edited when the user only opens and goes back', () => {
    const backStart = appShellSource.indexOf('const handleBackToDashboard = () => {');
    const persistStart = appShellSource.indexOf('const handlePersistActiveProject', backStart);
    const backBlock = appShellSource.slice(backStart, persistStart);

    expect(backBlock).toContain("setScreen('dashboard')");
    expect(backBlock).not.toContain('persistProjectContent');
    expect(backBlock).not.toContain('lastEditedIso');
  });

  it('opens the bundled sample manuscript with real content instead of an empty editor', () => {
    expect(appShellSource).toContain('LONG_PORTUGUESE_MANUSCRIPT');
    expect(appShellSource).toContain('initialManuscriptForProject(project)');
    expect(appShellSource).toContain("project.id === '1'");
  });

  it('does not store instructional placeholder copy as real book text', () => {
    expect(appShellSource).not.toContain('Escreva os capítulos do seu livro aqui');
  });

  it('uses the vendored canvas-editor source instead of the npm package', () => {
    expect(packageJsonSource).not.toContain('"@hufe921/canvas-editor"');
    expect(appShellSource).not.toContain("from '@hufe921/canvas-editor'");
    expect(canvasShellSource).not.toContain("from '@hufe921/canvas-editor'");
    expect(hostSource).not.toContain("from '@hufe921/canvas-editor'");
    expect(hostSource).toContain("from '../vendor/canvas-editor'");
    expect(vendorIndexSource).toContain("export { default } from './editor'");
    expect(vendorIndexSource).toContain("export * from './editor'");
  });

  it('gets Draw through the vendored public API without the bind interception hack', () => {
    expect(hostSource).toContain('.getDraw()');
    expect(hostSource).not.toContain('captureDrawDuring');
    expect(hostSource).not.toContain('[Prelo] Falha ao capturar o Draw');
    expect(vendorEditorSource).toContain('public getDraw()');
  });

  it('exports through Prelo pdf code instead of browser print dialog', () => {
    expect(canvasShellSource).toContain('renderCanvasPrintPdfFromPreparedPages');
    expect(canvasShellSource).toContain('canvasPixelRatioForPrintDpi');
    expect(canvasShellSource).toContain('preparePageImageExport');
    expect(canvasShellSource).toContain('getRenderedPageImage');
    expect(canvasShellSource).not.toContain('getPageImage(i, pixelRatio)');
    expect(canvasShellSource).not.toContain('executePrint');

    // O EXPORT continua usando o caminho streaming (página a página), nunca o
    // getPageImages em lote — esse é reservado à pré-visualização lado a lado.
    const exportBlock = canvasShellSource.match(
      /async function runRasterExport\(\) \{[\s\S]*?\n {2}\}/
    )?.[0] ?? '';
    expect(exportBlock).toContain('renderCanvasPrintPdfFromPreparedPages');
    expect(exportBlock).not.toContain('getPageImages');

    // O aviso de livro grande agora é um modal estilizado, não window.confirm.
    expect(canvasShellSource).not.toContain('window.confirm');
    expect(canvasShellSource).toContain('showLargeExportWarn');
  });

  it('keeps host inputs stable so typing does not recreate the editor every render', () => {
    expect(canvasShellSource).toContain('useMemo');
    expect(canvasShellSource).toContain('useCallback');
    expect(canvasShellSource).toContain('onChange={handleChange}');
    expect(canvasShellSource).toContain('onPageCountChange={handlePageCountChange}');
  });

  it('refreshes the word count when a saved document mounts', () => {
    expect(canvasShellSource).toContain('refreshWordCount');
    expect(canvasShellSource).toContain('handleEditorReady');
    expect(canvasShellSource).toContain('onReady={handleEditorReady}');
    expect(hostSource).toContain('onReady?: () => void');
    expect(hostSource).toContain('onReady?.()');
  });

  it('does not run mutating auto-hyphenation from the typing change listener', () => {
    const contentChangeBlock = hostSource.match(
      /editor\.listener\.contentChange = \(\) => \{[\s\S]*?\n {6}\};/
    )?.[0];

    expect(contentChangeBlock).toBeTruthy();
    expect(contentChangeBlock).not.toContain('scheduleHyphenation');
    expect(hostSource).toContain('applyHyphenation(draw)');
  });

  it('keeps book layout controls in the Prelo layer before adapting to Canvas', () => {
    expect(canvasShellSource).toContain('bookLayout');
    expect(canvasShellSource).toContain('handleBookLayoutMarginChange');
    expect(canvasShellSource).toContain('hasInexactMirroredMarginPreview');
    expect(canvasShellSource).toContain('setPaperMargins');
    expect(canvasShellSource).toContain('setPaperSize');
  });

  it('renders an honest print export preflight panel driven by the export report', () => {
    expect(canvasShellSource).toContain('buildPrintExportPreflight');
    expect(canvasShellSource).toContain('renderCanvasPrintPdfFromPreparedPages');
    expect(canvasShellSource).toContain('Preflight');
  });

  it('labels the export action as raster 300 DPI instead of print-ready final', () => {
    expect(canvasShellSource).toMatch(/300 DPI \(raster\)/i);
  });

  it('offers a one-click local PDF/X export from the faithful canvas snapshot path', () => {
    expect(canvasShellSource).toContain('exportCanvasVectorPdfFromSnapshot');
    expect(canvasShellSource).not.toContain('exportCanvasVectorPdf,');
    expect(canvasShellSource).toMatch(/PDF\/X \(offset\)/i);
    expect(canvasShellSource).toContain("fetch('/api/pdfx'");
    expect(canvasShellSource).toContain('-pdfx.pdf');
    expect(canvasShellSource).toContain('bleedMm: 3');
    expect(canvasShellSource).toContain('cropMarks: true');
    expect(canvasShellSource).toContain('PDF/X-1a CMYK baixado');
    expect(canvasShellSource).not.toContain('fallback vetorial');
    // Continua sem importar o pacote do Canvas direto no shell (fronteira de arquitetura).
    expect(canvasShellSource).not.toContain("from '@hufe921/canvas-editor'");
  });

  it('documents toolbar controls with visible tooltip text', () => {
    const tooltipCount = canvasShellSource.match(/data-tooltip=/g)?.length ?? 0;

    expect(tooltipCount).toBeGreaterThanOrEqual(35);
    expect(canvasShellSource).toContain('TOOLTIPS');
    expect(canvasShellSource).toContain('Exporta o livro em PDF');
    expect(canvasShellSource).toContain('Define a margem interna, do lado da lombada');
    expect(canvasShellSource).toContain('Mostra duas paginas lado a lado');
    expect(canvasShellSource).toContain('Canvas ainda usa margem global');
  });

  it('keeps final-user editor controls only, without fake desktop menus or placeholder actions', () => {
    expect(canvasShellSource).not.toContain('<button className="canvas-menu-btn">Manuscrito</button>');
    expect(canvasShellSource).not.toContain('<button className="canvas-menu-btn">Editar</button>');
    expect(canvasShellSource).not.toContain('<button className="canvas-menu-btn">Inserir</button>');
    expect(canvasShellSource).not.toContain('<button className="canvas-menu-btn">Formato</button>');
    expect(canvasShellSource).not.toContain('<button className="canvas-menu-btn">Recursos de IA</button>');
    expect(canvasShellSource).not.toContain('<button className="canvas-menu-btn">Ver</button>');
    expect(canvasShellSource).not.toContain('<button className="canvas-menu-btn">Revisões</button>');
    expect(canvasShellSource).not.toContain('+ Adicionar novo');
    expect(canvasShellSource).not.toContain('placeholder="teste 3"');
    expect(canvasShellSource).not.toContain('void [');
  });

  it('keeps bug reporting and cloud status visible for the product surface', () => {
    expect(canvasShellSource).toContain('setShowBugReport(true)');
    expect(canvasShellSource).toContain('Encontrou um problema?');
    expect(canvasShellSource).toContain('● Salvo na nuvem');
  });

  it('exposes undo and redo as real toolbar actions', () => {
    expect(canvasShellSource).toContain('function handleUndo()');
    expect(canvasShellSource).toContain('editor.undo()');
    expect(canvasShellSource).toContain('function handleRedo()');
    expect(canvasShellSource).toContain('editor.redo()');
    expect(canvasShellSource).toContain('data-tooltip={TOOLTIPS.undo}');
    expect(canvasShellSource).toContain('data-tooltip={TOOLTIPS.redo}');
    expect(canvasShellSource).toContain('aria-label="Desfazer"');
    expect(canvasShellSource).toContain('aria-label="Refazer"');
  });

  it('removes the complete/simple mode toggle from the product header', () => {
    expect(canvasShellSource).not.toContain('simpleMode');
    expect(canvasShellSource).not.toContain('setSimpleMode');
    expect(canvasShellSource).not.toContain('Completo');
    expect(canvasShellSource).not.toContain('Simples');
    expect(productCssSource).not.toContain('canvas-mode-toggle');
    expect(productCssSource).not.toContain('simple-mode');
  });

  it('renders side-by-side review as a read-only image spread over a single editor instance', () => {
    expect(canvasShellSource).toContain('handleTogglePairView');
    expect(canvasShellSource).toContain('data-tooltip={TOOLTIPS.pairView}');
    // Editor ao vivo único e SEM o antigo truque de CSS de colunas.
    expect(canvasShellSource.match(/<CanvasEditorHost/g)?.length ?? 0).toBe(1);
    expect(canvasShellSource).not.toContain('editorRef2');
    expect(canvasShellSource).not.toContain("pairView ? ' pair-view'");
    expect(productCssSource).not.toContain('.canvas-editor-stage.pair-view');
    expect(productCssSource).not.toContain('grid-template-columns: repeat(2, max-content)');

    // O spread usa imagens das páginas renderizadas (sem editar — sem bug de cursor).
    expect(canvasShellSource).toContain('getPageImages');
    expect(canvasShellSource).toContain('buildSpreads');
    expect(canvasShellSource).toContain('canvas-spread-overlay');
    expect(canvasShellSource).toContain('handleOpenPageFromSpread');

    // Clicar numa página sai do spread e volta a editar naquela página, de forma
    // determinística: guarda a página num ref e rola num efeito após o overlay
    // desmontar (sem setTimeout de "chute").
    expect(canvasShellSource).toContain('setPairView(false)');
    expect(canvasShellSource).toContain('pendingJumpPageRef.current = pageNo');
    expect(canvasShellSource).toContain('scrollToPage');
    expect(canvasShellSource).not.toContain('setTimeout(() => handleJumpToPage');

    // Estilos do spread presentes.
    expect(productCssSource).toContain('.canvas-spread-overlay');
    expect(productCssSource).toContain('.canvas-spread-row');
    expect(productCssSource).toContain('.canvas-spread-page');
  });

  it('groups spread pages as an open book: first page alone on the right, then pairs', () => {
    const buildSpreadsBlock = canvasShellSource.match(
      /function buildSpreads\(images: string\[\]\): SpreadSlot\[\]\[\] \{[\s\S]*?\n\}/
    )?.[0] ?? '';
    expect(buildSpreadsBlock).toContain('if (!first) return []');
    expect(buildSpreadsBlock).toContain('[[null, first]]');
    expect(buildSpreadsBlock).toContain('i += 2');
  });

  it('keeps side menu strips focused on one active tab instead of lighting every icon', () => {
    expect(canvasShellSource).toContain("type LeftTab = 'chapters' | 'pages';");
    expect(canvasShellSource).toContain("const [activeLeftTab, setActiveLeftTab] = useState<LeftTab | null>('chapters');");
    expect(canvasShellSource).toContain("setActiveLeftTab(current => current === tab ? null : tab)");
    expect(canvasShellSource).toContain("type RightTab = 'page' | 'margins' | 'search' | 'watermark' | 'export' | 'stats';");
    expect(canvasShellSource).toContain("const [activeRightTab, setActiveRightTab] = useState<RightTab | null>('page');");
    expect(canvasShellSource).toContain("setActiveRightTab(current => current === tab ? null : tab)");
    expect(canvasShellSource).not.toContain("activeLeftTab === 'all' ||");
    expect(canvasShellSource).not.toContain("activeRightTab === 'all' ||");
    expect(canvasShellSource).not.toContain("setActiveLeftTab('all')");
    expect(canvasShellSource).not.toContain("setActiveRightTab('all')");
  });

  it('fully collapses side drawers without leaving drawer content behind the icon strips', () => {
    expect(canvasShellSource).toContain("canvas-editor-left-sidebar-container ${!activeLeftTab ? 'drawer-collapsed' : ''}");
    expect(canvasShellSource).toContain("canvas-editor-right-sidebar-container ${!activeRightTab ? 'drawer-collapsed' : ''}");
    expect(productCssSource).toContain('.canvas-editor-left-sidebar-container.drawer-collapsed');
    expect(productCssSource).toContain('.canvas-editor-right-sidebar-container.drawer-collapsed');

    const collapsedDrawerBlock = productCssSource.match(
      /\.canvas-editor-sidebar-drawer\.collapsed \{[\s\S]*?\}/
    )?.[0] ?? '';

    expect(collapsedDrawerBlock).toContain('flex: 0 0 0');
    expect(collapsedDrawerBlock).toContain('width: 0');
    expect(collapsedDrawerBlock).toContain('min-width: 0');
    expect(collapsedDrawerBlock).toContain('overflow: hidden');
    expect(collapsedDrawerBlock).toContain('pointer-events: none');
  });

  it('keeps first-line indent feedback wired to the current paragraph', () => {
    expect(canvasShellSource).toContain('firstLineIndentActive');
    expect(canvasShellSource).toContain("className={`tb-icon-btn ${firstLineIndentActive ? 'active' : ''}`}");
    expect(canvasShellSource).toContain('onFirstLineIndentActiveChange={setFirstLineIndentActive}');
    expect(canvasShellSource).toContain('toggleFirstLineIndent()');
    expect(hostSource).toContain('getFirstLineIndentManualActive');
    expect(hostSource).toContain('editor.listener.rangeStyleChange');
    expect(hostSource).not.toContain('__PRELO_DRAW__');
    expect(hostSource).not.toContain('__PRELO_EDITOR__');
  });

  it('does not promise title-aware indent behavior before that rule exists', () => {
    expect(canvasShellSource).not.toContain('após um título fica sem recuo');
  });

  it('overrides plain Enter in the wrapper so it creates a Prelo paragraph, not a soft line break', () => {
    expect(hostSource).toContain('createCanvasParagraphBreakElements');
    expect(hostSource).toContain('shouldHandleParagraphEnter');
    expect(hostSource).toContain("addEventListener('keydown'");
    expect(hostSource).toContain('executeInsertElementList(createCanvasParagraphBreakElements())');
  });
});
