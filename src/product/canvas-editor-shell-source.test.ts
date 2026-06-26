/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appShellSource = readFileSync(join(process.cwd(), 'src/product/AppShell.tsx'), 'utf8');
const canvasShellSource = readFileSync(join(process.cwd(), 'src/product/CanvasEditorShell.tsx'), 'utf8');
const hostSource = readFileSync(join(process.cwd(), 'src/canvas-editor/CanvasEditorHost.tsx'), 'utf8');
const productCssSource = readFileSync(join(process.cwd(), 'src/product/product.css'), 'utf8');

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

  it('does not store instructional placeholder copy as real book text', () => {
    expect(appShellSource).not.toContain('Escreva os capítulos do seu livro aqui');
  });

  it('keeps direct canvas-editor package usage inside the wrapper boundary', () => {
    expect(appShellSource).not.toContain("from '@hufe921/canvas-editor'");
    expect(canvasShellSource).not.toContain("from '@hufe921/canvas-editor'");
    expect(hostSource).toContain("from '@hufe921/canvas-editor'");
  });

  it('exports through Prelo pdf code instead of browser print dialog', () => {
    expect(canvasShellSource).toContain('renderCanvasPrintPdf');
    expect(canvasShellSource).toContain('canvasPixelRatioForPrintDpi');
    expect(canvasShellSource).not.toContain('getPageImages(2)');
    expect(canvasShellSource).not.toContain('executePrint');
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
    expect(canvasShellSource).toContain('preflightCanvasPrintExport');
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

  it('exposes side-by-side review as a real read-only secondary pane', () => {
    expect(canvasShellSource).toContain('handleTogglePairView');
    expect(canvasShellSource).toContain('pairView ?');
    expect(canvasShellSource).toContain('EditorMode.READONLY');
    expect(canvasShellSource).toContain('data-tooltip={TOOLTIPS.pairView}');

    const pairBlock = canvasShellSource.match(/pairView \? \([\s\S]*?\) : \(/)?.[0] ?? '';
    expect(pairBlock).toContain('ref={editorRef}');
    expect(pairBlock).toContain('ref={editorRef2}');
    expect(pairBlock).toContain('options={reviewOptions}');
    expect(pairBlock).not.toContain('ref={editorRef2}[\s\S]*onChange={handleChange}');
  });

  it('keeps side menu strips focused on one active tab instead of lighting every icon', () => {
    expect(canvasShellSource).toContain("type LeftTab = 'chapters' | 'pages';");
    expect(canvasShellSource).toContain("const [activeLeftTab, setActiveLeftTab] = useState<LeftTab>('chapters');");
    expect(canvasShellSource).toContain("type RightTab = 'page' | 'margins' | 'search' | 'watermark' | 'export' | 'stats';");
    expect(canvasShellSource).toContain("const [activeRightTab, setActiveRightTab] = useState<RightTab>('page');");
    expect(canvasShellSource).not.toContain("activeLeftTab === 'all' ||");
    expect(canvasShellSource).not.toContain("activeRightTab === 'all' ||");
    expect(canvasShellSource).not.toContain("setActiveLeftTab('all')");
    expect(canvasShellSource).not.toContain("setActiveRightTab('all')");
  });

  it('fully collapses side drawers without leaving drawer content behind the icon strips', () => {
    expect(canvasShellSource).toContain("canvas-editor-left-sidebar-container ${!showLeftSidebar ? 'drawer-collapsed' : ''}");
    expect(canvasShellSource).toContain("canvas-editor-right-sidebar-container ${!showRightSidebar ? 'drawer-collapsed' : ''}");
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
