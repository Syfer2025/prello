import { useState } from 'react';

interface SystemDesignPageProps {
  onBack: () => void;
}

export default function SystemDesignPage({ onBack }: SystemDesignPageProps) {
  const [tab, setTab] = useState<'arch' | 'flow' | 'state' | 'storage' | 'api'>('arch');

  return (
    <div className="system-design-container">
      <header className="system-design-header">
        <button type="button" className="system-design-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Voltar
        </button>
        <div>
          <h1>Prelo — System Design</h1>
          <p className="sd-header-subtitle">Arquitetura interna do diagramador de livros · React 19 · Vite 8 · canvas-editor</p>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="sd-tabs">
        <button className={`sd-tab ${tab === 'arch' ? 'active' : ''}`} onClick={() => setTab('arch')}>Arquitetura</button>
        <button className={`sd-tab ${tab === 'flow' ? 'active' : ''}`} onClick={() => setTab('flow')}>Data Flow</button>
        <button className={`sd-tab ${tab === 'api' ? 'active' : ''}`} onClick={() => setTab('api')}>Canvas API</button>
        <button className={`sd-tab ${tab === 'storage' ? 'active' : ''}`} onClick={() => setTab('storage')}>Storage</button>
        <button className={`sd-tab ${tab === 'state' ? 'active' : ''}`} onClick={() => setTab('state')}>State</button>
      </nav>

      {tab === 'arch' && (
        <section className="sd-section">
          <h2 className="sd-section-title">Arquitetura de Componentes</h2>
          <p className="sd-section-desc">Hierarquia de renderização do React, com props e responsabilidades de cada camada.</p>

          <div className="sd-component-tree">
            <div className="sd-tree-node sd-tree-root">
              <code className="sd-code">main.tsx</code>
              <span className="sd-node-meta">entry point</span>
              <div className="sd-tree-children">
                <div className="sd-tree-node sd-tree-layer">
                  <code className="sd-code">&lt;ErrorBoundary&gt;</code>
                  <span className="sd-node-meta">componentDidCatch</span>
                  <div className="sd-tree-children">
                    <div className="sd-tree-node sd-tree-layer">
                      <code className="sd-code">&lt;AppShell&gt;</code>
                      <span className="sd-node-meta">screen: home | login | dashboard | editor | system-design</span>
                      <div className="sd-tree-children">
                        <div className="sd-tree-node-row">
                          <div className="sd-tree-node sd-tree-leaf">
                            <code className="sd-code">&lt;LandingPage&gt;</code>
                            <span className="sd-node-meta">home screen</span>
                          </div>
                          <div className="sd-tree-node sd-tree-leaf">
                            <code className="sd-code">&lt;LoginCard&gt;</code>
                            <span className="sd-node-meta">login form</span>
                          </div>
                        </div>
                        <div className="sd-tree-node-row">
                          <div className="sd-tree-node sd-tree-leaf">
                            <code className="sd-code">&lt;Dashboard&gt;</code>
                            <span className="sd-node-meta">project grid · search · sort · CRUD</span>
                          </div>
                          <div className="sd-tree-node sd-tree-leaf">
                            <code className="sd-code">&lt;CanvasEditorShell&gt;</code>
                            <span className="sd-node-meta">props: onBack, onPersistProject</span>
                            <div className="sd-tree-children">
                              <div className="sd-tree-node sd-tree-leaf">
                                <code className="sd-code">&lt;CanvasEditorHost ref=&#123;editorRef&#125;&gt;</code>
                                <span className="sd-node-meta">CanvasEditorHandle · 46 methods</span>
                              </div>
                              <div className="sd-tree-node sd-tree-leaf">
                                <code className="sd-code">&lt;SettingsModal&gt;</code>
                                <span className="sd-node-meta">layout · theme · accent</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Module dependency table */}
          <div className="sd-card">
            <h3 className="sd-card-title">Dependências entre Módulos</h3>
            <table className="sd-props-table">
              <thead>
                <tr><th>Módulo</th><th>Importa de</th><th>Exporta</th></tr>
              </thead>
              <tbody>
                <tr><td><code>AppShell.tsx</code></td><td><code>CanvasEditorShell</code>, <code>canvas-persistence</code>, <code>book-layout-settings</code>, <code>prelo-canvas-units</code>, <code>prelo-canvas-data</code>, <code>project-content-storage</code></td><td><code>AppShell</code> (default)</td></tr>
                <tr><td><code>CanvasEditorShell.tsx</code></td><td><code>CanvasEditorHost</code>, <code>canvas-persistence</code>, <code>book-layout-settings</code>, <code>prelo-canvas-units</code>, <code>prelo-canvas-data</code>, <code>first-line-indent-preferences</code>, <code>print-export</code></td><td><code>CanvasEditorShell</code> (default)</td></tr>
                <tr><td><code>CanvasEditorHost.tsx</code></td><td><code>vendor/canvas-editor</code></td><td><code>CanvasEditorHost</code>, <code>CanvasEditorHandle</code>, <code>ICatalog</code>, enums</td></tr>
                <tr><td><code>canvas-persistence.ts</code></td><td>— (vanilla TS)</td><td><code>saveCanvasProject</code>, <code>loadCanvasProject</code>, <code>CANVAS_STORAGE_KEY</code></td></tr>
                <tr><td><code>project-content-storage.ts</code></td><td><code>canvas-persistence</code> (KeyValueStore)</td><td><code>persistProjectContent</code>, <code>projectContentStorageKey</code></td></tr>
                <tr><td><code>book-layout-settings.ts</code></td><td><code>prelo-canvas-types</code></td><td><code>bookLayoutSettingsFromPreset</code>, <code>BookLayoutSettings</code></td></tr>
                <tr><td><code>prelo-canvas-data.ts</code></td><td><code>book-layout-settings</code>, <code>prelo-canvas-units</code>, <code>vendor/canvas-editor</code></td><td><code>buildCanvasDocument</code>, <code>BuiltCanvasDocument</code></td></tr>
                <tr><td><code>first-line-indent-preferences.ts</code></td><td>— (vanilla TS)</td><td><code>loadFirstLineIndentAuto</code>, <code>saveFirstLineIndentAuto</code>, <code>loadFirstLineIndentMm</code>, <code>saveFirstLineIndentMm</code></td></tr>
              </tbody>
            </table>
          </div>

          {/* Key Interfaces */}
          <div className="sd-card">
            <h3 className="sd-card-title">Interfaces Centrais</h3>
            <pre className="sd-code-block" dangerouslySetInnerHTML={{
              __html: [
                `<span class="sd-code-comment">// AppShell.tsx — ProjectMetadata</span>`,
                `  <span class="sd-code-kw">interface</span> ProjectMetadata {`,
                `    id: <span class="sd-code-type">string</span>;`,
                `    name: <span class="sd-code-type">string</span>;`,
                `    author: <span class="sd-code-type">string</span>;`,
                `    preset: <span class="sd-code-type">string</span>;`,
                `    lastEditedIso: <span class="sd-code-type">string</span>;`,
                `  }`,
                ``,
                `<span class="sd-code-comment">// CanvasEditorShell.tsx</span>`,
                `  <span class="sd-code-kw">interface</span> CanvasShellState {`,
                `    projectName: <span class="sd-code-type">string</span>;`,
                `    bookLayout: <span class="sd-code-type">BookLayoutSettings</span>;`,
                `    document: <span class="sd-code-type">BuiltCanvasDocument</span>;`,
                `    dirty: <span class="sd-code-type">boolean</span>;`,
                `  }`,
                ``,
                `<span class="sd-code-comment">// canvas-persistence.ts</span>`,
                `  <span class="sd-code-kw">interface</span> PersistedCanvasProject {`,
                `    version: <span class="sd-code-type">number</span>;`,
                `    name: <span class="sd-code-type">string</span>;           <span class="sd-code-comment">// project name</span>`,
                `    bookLayout: <span class="sd-code-type">BookLayoutSettings</span>;`,
                `    editor: <span class="sd-code-type">IEditorResult</span>;   <span class="sd-code-comment">// vendor/canvas-editor</span>`,
                `    savedAtIso: <span class="sd-code-type">string</span>;`,
                `  }`,
                ``,
                `<span class="sd-code-comment">// book-layout-settings.ts</span>`,
                `  <span class="sd-code-kw">interface</span> BookLayoutSettings {`,
                `    trimId: <span class="sd-code-type">'a5' | '6x9' | 'custom'</span>;`,
                `    widthMm: <span class="sd-code-type">number</span>;`,
                `    heightMm: <span class="sd-code-type">number</span>;`,
                `    marginsMm: <span class="sd-code-type">{ top, bottom, inside, outside }</span>;`,
                `    facingPages: <span class="sd-code-type">boolean</span>;`,
                `    chapterStart: <span class="sd-code-type">'nextPage' | 'nextOddPage'</span>;`,
                `  }`,
              ].join('\n')
            }} />
          </div>
        </section>
      )}

      {tab === 'flow' && (
        <section className="sd-section">
          <h2 className="sd-section-title">Fluxo de Dados</h2>
          <p className="sd-section-desc">Lifecycle de operações críticas: abrir projeto, salvar, exportar.</p>

          {/* Flow: Open Project */}
          <div className="sd-card">
            <h3 className="sd-card-title">Abrir Projeto</h3>
            <div className="sd-sequence">
              <div className="sd-seq-step">
                <div className="sd-seq-marker sd-seq-start">1</div>
                <code>AppShell</code>
                <span className="sd-seq-arrow">→</span>
                <code>handleOpenProject(project)</code>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker">2</div>
                <code>projectContentStorageKey(project.id)</code>
                <span className="sd-seq-arrow">→</span>
                <span className="sd-seq-desc">lê <code>prelo.project.content.{'{'}id{'}'}</code></span>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker">3</div>
                <code>localStorage.setItem(CANVAS_STORAGE_KEY, savedContent)</code>
                <span className="sd-seq-arrow">→</span>
                <span className="sd-seq-desc">carrega no slot ativo</span>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker">4</div>
                <code>setScreen('editor')</code>
                <span className="sd-seq-arrow">→</span>
                <code>&lt;CanvasEditorShell&gt;</code>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker">5</div>
                <code>loadCanvasProject(localStorage)</code>
                <span className="sd-seq-arrow">→</span>
                <span className="sd-seq-desc">parseia <code>PersistedCanvasProject</code></span>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker">6</div>
                <code>loadInitialCanvasShellState()</code>
                <span className="sd-seq-arrow">→</span>
                <span className="sd-seq-desc">inicializa <code>CanvasShellState</code></span>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker sd-seq-end">7</div>
                <code>editorRef.current?.setPageMode(...)</code>
                <span className="sd-seq-arrow">→</span>
                <span className="sd-seq-desc">motor canvas-editor monta documento</span>
              </div>
            </div>
          </div>

          {/* Flow: Save */}
          <div className="sd-card">
            <h3 className="sd-card-title">Salvar Projeto</h3>
            <div className="sd-sequence">
              <div className="sd-seq-step">
                <div className="sd-seq-marker sd-seq-start">1</div>
                <code>handleSave()</code>
                <span className="sd-seq-arrow">→</span>
                <code>editorRef.current?.getValue()</code>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker">2</div>
                <code>saveCanvasProject(localStorage, {'{'}...state, data {'}'})</code>
                <span className="sd-seq-arrow">→</span>
                <span className="sd-seq-desc">serializa em <code>CANVAS_STORAGE_KEY</code></span>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker" style={{background:'rgba(245,158,11,0.3)', color:'#f59e0b'}}>3</div>
                <code>onPersistProject(serialized)</code>
                <span className="sd-seq-arrow">→</span>
                <code>persistProjectContent(projectId, content)</code>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker sd-seq-end">4</div>
                <code>setState({'{\u2026dirty: false}'})</code>
                <span className="sd-seq-arrow">→</span>
                <span className="sd-seq-desc">status "● Salvo na nuvem"</span>
              </div>
            </div>
          </div>

          {/* Flow: Export */}
          <div className="sd-card">
            <h3 className="sd-card-title">Exportar PDF</h3>
            <div className="sd-sequence">
              <div className="sd-seq-step">
                <div className="sd-seq-marker sd-seq-start">1</div>
                <code>handleExportPDF()</code>
                <span className="sd-seq-arrow">→</span>
                <code>setExportStatus('generating')</code>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker">2</div>
                <code>CanvasPrintExport.exportBook(editorRef, ...)</code>
                <span className="sd-seq-arrow">→</span>
                <span className="sd-seq-desc">renderiza página a página</span>
              </div>
              <div className="sd-seq-step">
                <div className="sd-seq-marker">3</div>
                <code>downloadBytes(fileName, bytes, mimeType)</code>
                <span className="sd-seq-arrow">→</span>
                <span className="sd-seq-desc">blob → download link → click</span>
              </div>
            </div>
          </div>

          {/* Flow: Catalog */}
          <div className="sd-card">
            <h3 className="sd-card-title">Navegação por Capítulos (Catalog)</h3>
            <pre className="sd-code-block" style={{fontSize:'12px'}} dangerouslySetInnerHTML={{
              __html: [
                `<span class="sd-code-comment">// CanvasEditorShell.tsx — fetchCatalog()</span>`,
                `<span class="sd-code-kw">async function</span> fetchCatalog() {`,
                `  <span class="sd-code-kw">const</span> catalog = <span class="sd-code-kw">await</span> editorRef.current?.getCatalog();`,
                `  <span class="sd-code-kw">if</span> (!catalog) <span class="sd-code-kw">return</span>;`,
                `  setCatalogItems(catalog);  <span class="sd-code-comment">// ICatalog = ICatalogItem[]</span>`,
                `}`,
                ``,
                `<span class="sd-code-comment">// ICatalogItem</span>`,
                `{`,
                `  id: <span class="sd-code-type">string</span>;`,
                `  name: <span class="sd-code-type">string</span>;       <span class="sd-code-comment">// "Capítulo 1"</span>`,
                `  level: <span class="sd-code-type">TitleLevel</span>; <span class="sd-code-comment">// H1 | H2 | H3</span>`,
                `  pageNo: <span class="sd-code-type">number</span>;    <span class="sd-code-comment">// página onde começa</span>`,
                `  subCatalog: <span class="sd-code-type">ICatalogItem[]</span>;  <span class="sd-code-comment">// subseções</span>`,
                `}`,
                ``,
                `<span class="sd-code-comment">// Navegação:</span>`,
                `editorRef.current?.locationCatalog(item.id);`,
                `editorRef.current?.setPageNo(item.pageNo);`,
              ].join('\n')
            }} />
            <p className="sd-note">O catálogo é buscado 1x na montagem + quando dirty (debounce 1s). Sem polling infinito.</p>
          </div>
        </section>
      )}

      {tab === 'api' && (
        <section className="sd-section">
          <h2 className="sd-section-title">Canvas Editor — API Surface</h2>
          <p className="sd-section-desc">Interface completa exposta por <code>CanvasEditorHandle</code> (ref) para controle do motor.</p>

          <div className="sd-card">
            <h3 className="sd-card-title">Métodos do Editor (46)</h3>
            <table className="sd-props-table">
              <thead>
                <tr><th>Categoria</th><th>Método</th><th>Descrição</th></tr>
              </thead>
              <tbody>
                <tr><td rowSpan={3} className="sd-category-cell">Documento</td><td><code>getValue(): IEditorResult</code></td><td>Snapshot completo do documento</td></tr>
                <tr><td><code>getLayoutSnapshot(): CanvasLayoutSnapshot | null</code></td><td>Posições/estilos por glifo para exportação vetorial</td></tr>
                <tr><td><code>getPageImages(pixelRatio?): Promise&lt;string[]&gt;</code></td><td>Renderiza páginas como base64 data-URIs</td></tr>
                <tr><td rowSpan={5} className="sd-category-cell">Inserção</td><td><code>insertPageBreak()</code></td><td>Quebra de página</td></tr>
                <tr><td><code>insertSeparator(dashArray?)</code></td><td>Separador horizontal</td></tr>
                <tr><td><code>insertTable(rows, cols)</code></td><td>Tabela com N linhas × M colunas</td></tr>
                <tr><td><code>insertImage(base64, width, height)</code></td><td>Imagem embutida</td></tr>
                <tr><td><code>insertHyperlink(url)</code></td><td>Link clicável</td></tr>
                <tr><td rowSpan={3} className="sd-category-cell">Formatação</td><td><code>toggleBold() / toggleItalic() / setUnderline() / setStrikeout()</code></td><td>Estilos inline</td></tr>
                <tr><td><code>setSuperscript() / setSubscript()</code></td><td>Sobrescrito/subscrito</td></tr>
                <tr><td><code>setFontFamily(family) / setFontSize(size) / sizeAdd() / sizeMinus()</code></td><td>Fonte</td></tr>
                <tr><td rowSpan={3} className="sd-category-cell">Parágrafo</td><td><code>setTitleLevel(level: TitleLevel)</code></td><td>H1/H2/H3/body</td></tr>
                <tr><td><code>setRowFlex(align: RowFlex)</code></td><td>Alinhamento (left/center/right/justify)</td></tr>
                <tr><td><code>toggleFirstLineIndent() / isFirstLineIndentActive()</code></td><td>Recuo de primeira linha</td></tr>
                <tr><td rowSpan={3} className="sd-category-cell">Layout</td><td><code>setPaperMargins(margins: [number,4])</code></td><td>Margens do papel</td></tr>
                <tr><td><code>setPaperSize(width, height)</code></td><td>Tamanho da página</td></tr>
                <tr><td><code>setPaperDirection(dir: PaperDirection)</code></td><td>Retrato/paisagem</td></tr>
                <tr><td rowSpan={4} className="sd-category-cell">Navegação</td><td><code>getCatalog(): Promise&lt;ICatalog | null&gt;</code></td><td>Índice de capítulos/seções</td></tr>
                <tr><td><code>locationCatalog(titleId)</code></td><td>Rola até o título</td></tr>
                <tr><td><code>search(query) / searchNext() / searchPrev()</code></td><td>Busca incremental</td></tr>
                <tr><td><code>replace(replacement)</code></td><td>Substitui texto</td></tr>
                <tr><td rowSpan={3} className="sd-category-cell">Utilitários</td><td><code>undo() / redo()</code></td><td>Histórico</td></tr>
                <tr><td><code>zoomIn() / zoomOut() / zoomReset()</code></td><td>Zoom</td></tr>
                <tr><td><code>getWordCount(): Promise&lt;number&gt;</code></td><td>Contagem de palavras</td></tr>
                <tr><td rowSpan={2} className="sd-category-cell">Export</td><td><code>print(): Promise&lt;void&gt;</code></td><td>Diálogo de impressão nativo</td></tr>
                <tr><td><code>formatPainter() / clearFormatting()</code></td><td>Pincel/formatação</td></tr>
              </tbody>
            </table>
          </div>

          <div className="sd-card">
            <h3 className="sd-card-title">Enums e Tipos</h3>
            <pre className="sd-code-block" dangerouslySetInnerHTML={{
              __html: [
                `<span class="sd-code-kw">enum</span> PageMode {`,
                `  PAGING = <span class="sd-code-string">'paging'</span>,`,
                `  CONTINUITY = <span class="sd-code-string">'continuity'</span>,`,
                `}`,
                ``,
                `<span class="sd-code-kw">enum</span> TitleLevel {`,
                `  FIRST = <span class="sd-code-string">'TitleLevel_First'</span>,  <span class="sd-code-comment">// H1</span>`,
                `  SECOND = <span class="sd-code-string">'TitleLevel_Second'</span>, <span class="sd-code-comment">// H2</span>`,
                `  THIRD = <span class="sd-code-string">'TitleLevel_Third'</span>,   <span class="sd-code-comment">// H3</span>`,
                `}`,
                ``,
                `<span class="sd-code-kw">enum</span> RowFlex {`,
                `  LEFT = <span class="sd-code-string">'rowflex_left'</span>,`,
                `  CENTER = <span class="sd-code-string">'rowflex_center'</span>,`,
                `  RIGHT = <span class="sd-code-string">'rowflex_right'</span>,`,
                `  ALIGN = <span class="sd-code-string">'rowflex_align'</span>,`,
                `}`,
                ``,
                `<span class="sd-code-kw">enum</span> ListType {`,
                `  OL = <span class="sd-code-string">'ListType_OL'</span>,`,
                `  UL = <span class="sd-code-string">'ListType_UL'</span>,`,
                `  TODO = <span class="sd-code-string">'ListType_TODO'</span>,`,
                `}`,
                ``,
                `<span class="sd-code-kw">enum</span> PaperDirection {`,
                `  VERTICAL = <span class="sd-code-string">'paperDirection_vertical'</span>,`,
                `  HORIZONTAL = <span class="sd-code-string">'paperDirection_horizontal'</span>,`,
                `}`,
              ].join('\n')
            }} />
          </div>
        </section>
      )}

      {tab === 'storage' && (
        <section className="sd-section">
          <h2 className="sd-section-title">localStorage — Schema Completo</h2>
          <p className="sd-section-desc">Todas as chaves utilizadas para persistência no navegador.</p>

          <div className="sd-card">
            <table className="sd-props-table">
              <thead>
                <tr><th>Chave</th><th>Tipo</th><th>Origem</th><th>Descrição</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>prelo.canvas.project.v1</code></td>
                  <td><code>PersistedCanvasProject</code></td>
                  <td><code>canvas-persistence.ts</code></td>
                  <td>Projeto ativo no editor (versão, nome, layout, dados do editor, timestamp)</td>
                </tr>
                <tr>
                  <td><code>prelo.project.content.{'{'}id{'}'}</code></td>
                  <td><code>string</code> (serializado)</td>
                  <td><code>project-content-storage.ts</code></td>
                  <td>Conteúdo de cada projeto individual (chave por projectId)</td>
                </tr>
                <tr>
                  <td><code>prelo-projects-list</code></td>
                  <td><code>ProjectMetadata[]</code></td>
                  <td><code>AppShell.tsx</code></td>
                  <td>Lista de projetos: id, name, author, preset, lastEditedIso</td>
                </tr>
                <tr>
                  <td><code>prelo-logged-in</code></td>
                  <td><code>'true' | 'false'</code></td>
                  <td><code>AppShell.tsx</code></td>
                  <td>Sessão de login simulada</td>
                </tr>
                <tr>
                  <td><code>prelo-editor-theme</code></td>
                  <td><code>string</code></td>
                  <td><code>CanvasEditorShell.tsx</code></td>
                  <td>Tema ativo (ex: <code>livingwriter</code>)</td>
                </tr>
                <tr>
                  <td><code>prelo-editor-accent</code></td>
                  <td><code>string</code></td>
                  <td><code>CanvasEditorShell.tsx</code></td>
                  <td>Cor de destaque (ex: <code>teal</code>)</td>
                </tr>
                <tr>
                  <td><code>prelo-show-left-sidebar</code></td>
                  <td><code>'true' | 'false'</code></td>
                  <td><code>CanvasEditorShell.tsx</code></td>
                  <td>Visibilidade da sidebar esquerda</td>
                </tr>
                <tr>
                  <td><code>prelo-show-right-sidebar</code></td>
                  <td><code>'true' | 'false'</code></td>
                  <td><code>CanvasEditorShell.tsx</code></td>
                  <td>Visibilidade da sidebar direita</td>
                </tr>
                <tr>
                  <td><code>prelo-fli-auto-v2</code></td>
                  <td><code>boolean</code></td>
                  <td><code>first-line-indent-preferences.ts</code></td>
                  <td>Recuo automático de primeira linha</td>
                </tr>
                <tr>
                  <td><code>prelo-fli-mm</code></td>
                  <td><code>number</code> (default 6)</td>
                  <td><code>first-line-indent-preferences.ts</code></td>
                  <td>Tamanho do recuo em mm</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="sd-card">
            <h3 className="sd-card-title">Estrutura <code>PersistedCanvasProject</code></h3>
            <pre className="sd-code-block" dangerouslySetInnerHTML={{
              __html: [
                `{`,
                `  version: <span class="sd-code-type">2</span>,                         <span class="sd-code-comment">// schema version</span>`,
                `  name: <span class="sd-code-string">"A Cidade de Papel"</span>,      <span class="sd-code-comment">// project name</span>`,
                `  bookLayout: {`,
                `    trimId: <span class="sd-code-string">"a5"</span>,`,
                `    widthMm: <span class="sd-code-type">148</span>,`,
                `    heightMm: <span class="sd-code-type">210</span>,`,
                `    marginsMm: { top: 17, bottom: 17, inside: 17, outside: 14 },`,
                `    facingPages: <span class="sd-code-kw">true</span>,`,
                `  },`,
                `  editor: {                        <span class="sd-code-comment">// IEditorResult</span>`,
                `    version: <span class="sd-code-string">"0.9.136"</span>,`,
                `    data: { main: IElement[] },  <span class="sd-code-comment">// parágrafos + formatação</span>`,
                `    options: {...}          <span class="sd-code-comment">// configurações do editor</span>`,
                `  },`,
                `  savedAtIso: <span class="sd-code-string">"2026-06-23T16:38:00.000Z"</span>`,
                `}`,
              ].join('\n')
            }} />
          </div>
        </section>
      )}

      {tab === 'state' && (
        <section className="sd-section">
          <h2 className="sd-section-title">Gerenciamento de Estado</h2>
          <p className="sd-section-desc">Todos os <code>useState</code> e <code>useEffect</code> da aplicação.</p>

          <div className="sd-card">
            <h3 className="sd-card-title">AppShell — Estado Global</h3>
            <table className="sd-props-table">
              <thead>
                <tr><th>State</th><th>Tipo</th><th>Inicialização</th><th>Uso</th></tr>
              </thead>
              <tbody>
                <tr><td><code>isLoggedIn</code></td><td><code>boolean</code></td><td><code>localStorage('prelo-logged-in')</code></td><td>Autenticação simulada</td></tr>
                <tr><td><code>screen</code></td><td><code>Screen</code></td><td><code>isLoggedIn ? 'dashboard' : 'home'</code></td><td>Roteamento de telas</td></tr>
                <tr><td><code>projects</code></td><td><code>ProjectMetadata[]</code></td><td><code>localStorage('prelo-projects-list')</code> ou default</td><td>Lista de projetos</td></tr>
                <tr><td><code>activeProjectId</code></td><td><code>string | null</code></td><td><code>null</code></td><td>Projeto aberto no editor</td></tr>
                <tr><td><code>searchQuery</code></td><td><code>string</code></td><td><code>''</code></td><td>Filtro de busca</td></tr>
                <tr><td><code>sortOrder</code></td><td><code>'recent' | 'alpha'</code></td><td><code>'recent'</code></td><td>Ordenação dos cards</td></tr>
                <tr><td><code>showDeleteConfirm</code></td><td><code>string | null</code></td><td><code>null</code></td><td>ID do projeto a excluir</td></tr>
                <tr><td><code>showWizard</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Modal de criar projeto</td></tr>
              </tbody>
            </table>
          </div>

          <div className="sd-card">
            <h3 className="sd-card-title">CanvasEditorShell — Estado do Editor</h3>
            <table className="sd-props-table">
              <thead>
                <tr><th>State</th><th>Tipo</th><th>Padrão</th><th>Uso</th></tr>
              </thead>
              <tbody>
                <tr><td><code>state</code></td><td><code>CanvasShellState</code></td><td><code>loadInitialCanvasShellState()</code></td><td>Documento, nome, layout, dirty flag</td></tr>
                <tr><td><code>pageCount</code></td><td><code>number</code></td><td><code>0</code></td><td>Número de páginas renderizadas</td></tr>
                <tr><td><code>exportStatus</code></td><td><code>ExportStatus</code></td><td><code>'idle'</code></td><td>Status da exportação PDF</td></tr>
                <tr><td><code>simpleMode</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Modo simplificado (esconde ferramentas avançadas)</td></tr>
                <tr><td><code>showLeftSidebar</code></td><td><code>boolean</code></td><td><code>localStorage</code></td><td>Sidebar de navegação</td></tr>
                <tr><td><code>catalogItems</code></td><td><code>ICatalogItem[]</code></td><td><code>[]</code></td><td>Índice de capítulos/seções</td></tr>
                <tr><td><code>searchQuery</code></td><td><code>string</code></td><td><code>''</code></td><td>Busca no editor</td></tr>
                <tr><td><code>showExitConfirm</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Modal de saída com alterações não salvas</td></tr>
              </tbody>
            </table>
          </div>

          <div className="sd-card">
            <h3 className="sd-card-title">Efeitos (useEffect)</h3>
            <table className="sd-props-table">
              <thead>
                <tr><th>Local</th><th>Dispara quando</th><th>Faz</th></tr>
              </thead>
              <tbody>
                <tr><td><code>AppShell</code></td><td><code>projects</code> muda</td><td>Salva <code>prelo-projects-list</code></td></tr>
                <tr><td><code>AppShell</code></td><td><code>isLoggedIn</code> muda</td><td>Salva <code>prelo-logged-in</code></td></tr>
                <tr><td><code>CanvasEditorShell</code></td><td><code>state.dirty === true</code></td><td>Registra <code>beforeunload</code> handler</td></tr>
                <tr><td><code>CanvasEditorShell</code></td><td>Montagem</td><td>Busca catálogo via <code>getCatalog()</code></td></tr>
                <tr><td><code>CanvasEditorShell</code></td><td><code>state.dirty</code> (debounce 1s)</td><td>Re-busca catálogo</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Footer info */}
      <div className="sd-footer">
        <span>Prelo v0.1 · React 19 · Vite 8 · TypeScript strict · canvas-editor vendorizado · localStorage</span>
      </div>
    </div>
  );
}
