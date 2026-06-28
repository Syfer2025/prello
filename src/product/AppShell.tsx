import { useState, useEffect, useMemo } from 'react';
import CanvasEditorShell from './CanvasEditorShell';
import { saveCanvasProject, CANVAS_STORAGE_KEY } from '../canvas-editor/canvas-persistence';
import { bookLayoutSettingsFromPreset } from '../canvas-editor/book-layout-settings';
import { PRELO_CANVAS_PRESETS } from '../canvas-editor/prelo-canvas-units';
import { buildCanvasDocument } from '../canvas-editor/prelo-canvas-data';
import { LONG_PORTUGUESE_MANUSCRIPT } from '../fixtures/long-portuguese-manuscript';
import { persistProjectContent, projectContentStorageKey } from './project-content-storage';
import './product.css';
import SystemDesignPage from './SystemDesignPage';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora mesmo';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} dia${days > 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  return `há ${months} mês${months > 1 ? 'es' : ''}`;
}

function projectColor(id: string): string {
  const colors = [
    ['#0d9488', '#0f766e'],
    ['#6366f1', '#4338ca'],
    ['#f59e0b', '#d97706'],
    ['#ef4444', '#dc2626'],
    ['#ec4899', '#db2777'],
    ['#8b5cf6', '#6d28d9'],
    ['#14b8a6', '#0d9488'],
    ['#f97316', '#ea580c'],
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % colors.length;
  const color = colors[idx] ?? colors[0];
  if (!color) return 'linear-gradient(135deg, #0d9488, #0f766e)';
  return `linear-gradient(135deg, ${color[0]}, ${color[1]})`;
}

type Screen = 'home' | 'login' | 'dashboard' | 'editor' | 'system-design';

interface ProjectMetadata {
  id: string;
  name: string;
  author: string;
  preset: string;
  lastEditedIso: string;
}

const DEFAULT_PROJECTS: ProjectMetadata[] = [
  { id: '1', name: 'A Cidade de Papel', author: 'Alex Meirado', preset: 'a5', lastEditedIso: '2026-06-23T16:38:00Z' },
  { id: '2', name: 'Dom Casmurro', author: 'Machado de Assis', preset: '6x9', lastEditedIso: '2026-06-22T12:00:00Z' },
  { id: '3', name: 'O Cortiço', author: 'Aluísio Azevedo', preset: 'a5', lastEditedIso: '2026-06-21T09:30:00Z' },
];

function bookPresetForProject(project: Pick<ProjectMetadata, 'preset'>) {
  return project.preset === 'sixByNine' || project.preset === '6x9'
    ? PRELO_CANVAS_PRESETS.sixByNine
    : PRELO_CANVAS_PRESETS.a5;
}

function initialManuscriptForProject(project: Pick<ProjectMetadata, 'id'>): string {
  return project.id === '1' ? LONG_PORTUGUESE_MANUSCRIPT : '';
}

export default function AppShell() {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('prelo-logged-in') === 'true';
  });
  const [screen, setScreen] = useState<Screen>(() => {
    return localStorage.getItem('prelo-logged-in') === 'true' ? 'dashboard' : 'home';
  });
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Projects list
  const [projects, setProjects] = useState<ProjectMetadata[]>(() => {
    const saved = localStorage.getItem('prelo-projects-list');
    if (saved) {
      try {
        return JSON.parse(saved) as ProjectMetadata[];
      } catch {
        return DEFAULT_PROJECTS;
      }
    }
    return DEFAULT_PROJECTS;
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [sortOrder, setSortOrder] = useState<'recent' | 'alpha'>('recent');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // New Project Wizard
  const [showWizard, setShowWizard] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newPreset, setNewPreset] = useState<'a5' | 'sixByNine'>('a5');

  // Save projects list to localStorage
  useEffect(() => {
    localStorage.setItem('prelo-projects-list', JSON.stringify(projects));
  }, [projects]);

  // Auth persistence
  useEffect(() => {
    localStorage.setItem('prelo-logged-in', isLoggedIn ? 'true' : 'false');
  }, [isLoggedIn]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setLoginError('Por favor, preencha todos os campos.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(loginEmail)) {
      setLoginError('Por favor, insira um e-mail válido.');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    // Simulate premium user login delay
    setTimeout(() => {
      setIsLoggingIn(false);
      setIsLoggedIn(true);
      setScreen('dashboard');
    }, 800);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setScreen('home');
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const projectId = Date.now().toString();
    const newProj: ProjectMetadata = {
      id: projectId,
      name: newTitle.trim(),
      author: newAuthor.trim() || 'Autor Anônimo',
      preset: newPreset,
      lastEditedIso: new Date().toISOString(),
    };

    // Save project metadata to list
    setProjects([newProj, ...projects]);

    // Initialize content for CanvasEditorShell
    const bookLayoutPreset = newPreset === 'sixByNine' ? PRELO_CANVAS_PRESETS.sixByNine : PRELO_CANVAS_PRESETS.a5;
    const defaultLayout = bookLayoutSettingsFromPreset(bookLayoutPreset);
    
    const initialDoc = buildCanvasDocument({
      title: newProj.name,
      manuscript: '',
      bookLayout: defaultLayout,
    });

    // Write to key loaded by editor
    saveCanvasProject(window.localStorage, {
      name: newProj.name,
      bookLayout: defaultLayout,
      editor: {
        version: '0.9.136',
        data: initialDoc.data,
        options: initialDoc.options,
      },
    });
    persistProjectContent(window.localStorage, projectId, localStorage.getItem(CANVAS_STORAGE_KEY));

    // Reset wizard fields & open editor
    setShowWizard(false);
    setNewTitle('');
    setNewAuthor('');
    setActiveProjectId(projectId);
    setScreen('editor');
  };

  const handleOpenProject = (project: ProjectMetadata) => {
    setActiveProjectId(project.id);
    
    // Check if the project content is already in the loaded storage key
    // In a multi-project setup, we store project contents in localStore with specific keys, e.g. `prelo.project.content.${project.id}`
    const savedContent = localStorage.getItem(projectContentStorageKey(project.id));
    if (savedContent) {
      localStorage.setItem(CANVAS_STORAGE_KEY, savedContent);
    } else {
      // If none exists, initialize default
      const bookLayoutPreset = bookPresetForProject(project);
      const defaultLayout = bookLayoutSettingsFromPreset(bookLayoutPreset);
      const initialDoc = buildCanvasDocument({
        title: project.name,
        manuscript: initialManuscriptForProject(project),
        bookLayout: defaultLayout,
      });

      saveCanvasProject(window.localStorage, {
        name: project.name,
        bookLayout: defaultLayout,
        editor: {
          version: '0.9.136',
          data: initialDoc.data,
          options: initialDoc.options,
        },
      });
    }

    setScreen('editor');
  };

  const handleBackToDashboard = () => {
    setActiveProjectId(null);
    setScreen('dashboard');
  };

  const handlePersistActiveProject = (serializedProject: string) => {
    persistProjectContent(window.localStorage, activeProjectId, serializedProject);
    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
        return { ...p, lastEditedIso: new Date().toISOString() };
      }
      return p;
    }));
  };

  const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(projectId);
  };

  const confirmDeleteProject = () => {
    if (!showDeleteConfirm) return;
    setProjects(prev => prev.filter(p => p.id !== showDeleteConfirm));
    localStorage.removeItem(projectContentStorageKey(showDeleteConfirm));
    if (activeProjectId === showDeleteConfirm) {
      setActiveProjectId(null);
    }
    setShowDeleteConfirm(null);
  };

  const filteredProjects = useMemo(() => {
    const filtered = projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (sortOrder === 'alpha') {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    return [...filtered].sort((a, b) => new Date(b.lastEditedIso).getTime() - new Date(a.lastEditedIso).getTime());
  }, [projects, searchQuery, sortOrder]);

  return (
    <div className="app-shell">
      <div className="app-shell-view">
          {screen === 'home' && (
              <div className="landing-container xtract-theme">
                <div className="stars"></div>
                <div className="stars2"></div>
                <div className="stars3"></div>
                
                <nav className="landing-nav">
                  <div className="landing-nav-logo">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <span>PRELO</span>
                  </div>
                  <div className="landing-nav-links">
                    <a href="#features">Recursos</a>
                    <a href="#pricing">Preços</a>
                    <a href="#about">Sobre</a>
                    <button type="button" className="landing-nav-btn btn-primary" onClick={() => setScreen('login')}>
                      Começar Grátis
                    </button>
                  </div>
                </nav>

                <main className="landing-hero">
                  <div className="landing-glow-orb center-glow" />
                  
                  <div className="landing-beta-pill">
                    <span className="pill-tag">Novo</span>
                    <span>Diagramação Inteligente</span>
                  </div>
                  
                  <h1 className="hero-title">Escreva e diagrame seu próprio livro.<br/>Sem depender de ninguém.</h1>
                  <p className="hero-subtitle">
                    A primeira plataforma que permite autores independentes criarem livros físicos com padrão de editora tradicional. 
                    Tipografia perfeita, margens automáticas e PDF pronto para a gráfica em minutos.
                  </p>
                  
                  <div className="landing-cta-row">
                    <button type="button" className="landing-hero-btn btn-primary" onClick={() => setScreen('login')}>
                      Começar a Diagramar
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </button>
                    <button type="button" className="landing-hero-btn btn-secondary" onClick={() => setScreen('login')}>
                      Ver Demonstração
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </button>
                  </div>

                  {/* 3D Isometric Browser Mockup - Adapted for Xtract theme */}
                  <div className="isometric-mockup-wrapper">
                    <div className="isometric-mockup">
                      <div className="mockup-glass-edge"></div>
                      <div className="mockup-header">
                        <div className="mac-dots">
                          <span></span><span></span><span></span>
                        </div>
                        <div className="mockup-address">prelo.design/editor</div>
                      </div>
                      <div className="mockup-body">
                        <div className="mockup-sidebar">
                          <div className="sidebar-item active"></div>
                          <div className="sidebar-item"></div>
                          <div className="sidebar-item"></div>
                        </div>
                        <div className="mockup-canvas">
                          <div className="mockup-page">
                            <div className="page-title"></div>
                            <div className="page-text-line full"></div>
                            <div className="page-text-line full"></div>
                            <div className="page-text-line medium"></div>
                            <div className="page-text-line full mt"></div>
                            <div className="page-text-line full"></div>
                            <div className="page-text-line short"></div>
                          </div>
                        </div>
                        <div className="mockup-sidebar right">
                          <div className="sidebar-panel"></div>
                          <div className="sidebar-panel small"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </main>

                <section id="features" className="landing-features">
                  <div className="features-header">
                    <h2>O fim das taxas abusivas de diagramação.</h2>
                    <p>Você no controle total. Uma ferramenta profissional simplificada para que qualquer autor consiga diagramar sua obra-prima para impressão com qualidade impecável.</p>
                  </div>
                  
                  <div className="bento-grid">
                    <div className="bento-card col-span-2">
                      <div className="bento-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7V4h16v3"></path><path d="M9 20h6"></path><path d="M12 4v16"></path></svg>
                      </div>
                      <h3>Texas-style Linebreaking</h3>
                      <p>Otimização tipográfica avançada baseada no algoritmo Knuth-Plass, com hifenização inteligente em português e controle automático de órfãs e viúvas para um bloco de texto impecável.</p>
                    </div>
                    
                    <div className="bento-card">
                      <div className="bento-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                      </div>
                      <h3>Exportação PDF/X CMYK</h3>
                      <p>Gere arquivos vetoriais em CMYK prontos para a gráfica com marcas de corte e sangria.</p>
                    </div>
                    
                    <div className="bento-card">
                      <div className="bento-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                      </div>
                      <h3>Layout Espelhado</h3>
                      <p>Margens interna e externa que se espelham entre páginas pares e ímpares para lombada e corte perfeitos.</p>
                    </div>
                    
                    <div className="bento-card">
                      <div className="bento-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                      </div>
                      <h3>Fontes Embutidas</h3>
                      <p>Utilize fontes profissionais (Garamond, Crimson Pro) embutidas diretamente no PDF.</p>
                    </div>
                    
                    <div className="bento-card">
                      <div className="bento-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                      </div>
                      <h3>Interface macOS Tahoe</h3>
                      <p>Escrita limpa com efeito vidro translúcido, temas e barras laterais ocultáveis com transição suave.</p>
                    </div>
                  </div>
                </section>
                
                <footer className="landing-footer">
                  <div className="footer-content">
                    <div className="footer-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          <span>PRELO</span>
                    </div>
                    <div className="footer-links">
                      <a href="#">Termos</a>
                      <a href="#">Privacidade</a>
                      <a href="#">Contato</a>
                      <button type="button" className="footer-btn-system" onClick={() => setScreen('system-design')}>
                        SYSTEM DESIGN
                      </button>
                    </div>
                  </div>
                </footer>
              </div>
            )}

          {screen === 'login' && (
              <div className="login-container">
                <div className="landing-glow" />
                <div className="login-card">
                  <div className="login-header-dots">
                    <span className="dot dot-red" onClick={() => setScreen('home')}></span>
                    <span className="dot dot-yellow"></span>
                    <span className="dot dot-green"></span>
                  </div>
                  <div className="login-logo">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                    <span>Prelo</span>
                  </div>
                  <h2>Bem-vindo de volta</h2>
                  <p>Insira as credenciais para gerenciar seus manuscritos.</p>
                  
                  <form onSubmit={handleLogin} className="login-form">
                    <div className="login-input-group">
                      <label htmlFor="email">E-mail</label>
                      <input
                        type="email"
                        id="email"
                        placeholder="exemplo@gmail.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        autoFocus
                      />
                    </div>
                    
                    <div className="login-input-group">
                      <label htmlFor="password">Senha</label>
                      <input
                        type="password"
                        id="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                    </div>

                    {loginError && <div className="login-error-msg">{loginError}</div>}

                    <button type="submit" className="login-btn-submit" disabled={isLoggingIn}>
                      {isLoggingIn ? 'Autenticando...' : 'Acessar Projetos'}
                    </button>
                  </form>
                  
                  <div className="login-footer">
                    <span>Não tem conta? </span>
                    <button type="button" onClick={() => {
                      setIsLoggedIn(true);
                      setScreen('dashboard');
                    }}>Entrar como Visitante</button>
                  </div>
                </div>
              </div>
            )}

          {screen === 'dashboard' && (
              <div className="dashboard-container">
                <header className="dashboard-navbar">
                  <div className="nav-logo">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                    <span>Prelo</span>
                  </div>
                  <div className="nav-profile-menu">
                    <div className="nav-avatar">AM</div>
                    <div className="nav-user-info">
                      <span className="nav-user-name">Alex Meirado</span>
                      <span className="nav-user-badge">Plano Premium</span>
                    </div>
                    <button type="button" className="nav-btn-logout" onClick={handleLogout}>Sair</button>
                  </div>
                </header>

                <main className="dashboard-content">
                  <div className="dashboard-header-row">
                    <div>
                      <h2>Meus Manuscritos</h2>
                      <p>Gerencie seus livros e configure a diagramação.</p>
                    </div>
                    <button type="button" className="dashboard-btn-new" onClick={() => setShowWizard(true)}>
                      + Novo Livro
                    </button>
                  </div>

                  <div className="dashboard-search-row">
                    <input
                      type="text"
                      className="dashboard-search-input"
                      placeholder="Buscar por título de projeto..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Buscar projetos"
                    />
                  </div>

                  <div className="dashboard-sort-row">
                    <span className="dashboard-sort-label">Ordenar:</span>
                    <button
                      type="button"
                      className={`dashboard-sort-btn ${sortOrder === 'recent' ? 'active' : ''}`}
                      onClick={() => setSortOrder('recent')}
                    >
                      Mais Recente
                    </button>
                    <button
                      type="button"
                      className={`dashboard-sort-btn ${sortOrder === 'alpha' ? 'active' : ''}`}
                      onClick={() => setSortOrder('alpha')}
                    >
                      A-Z
                    </button>
                  </div>

                  <div className="project-grid">
                    {/* New Project Dotted Button Card */}
                    <div className="project-card new-project-card" onClick={() => setShowWizard(true)} title="Criar novo livro">
                      <div className="plus-icon">+</div>
                      <span>Criar Novo Livro</span>
                    </div>

                    {filteredProjects.length === 0 ? (
                      <div className="dashboard-empty-state">
                        {searchQuery ? (
                          <>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b6f7a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <p className="empty-title">Nenhum resultado</p>
                            <p className="empty-subtitle">Nenhum projeto encontrado para "<strong>{searchQuery}</strong>"</p>
                            <button type="button" className="empty-cta" onClick={() => setSearchQuery('')}>Limpar busca</button>
                          </>
                        ) : (
                          <>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b6f7a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                            <p className="empty-title">Nenhum manuscrito</p>
                            <p className="empty-subtitle">Crie seu primeiro livro para começar a diagramar.</p>
                            <button type="button" className="empty-cta" onClick={() => setShowWizard(true)}>Criar Primeiro Livro</button>
                          </>
                        )}
                      </div>
                    ) : (
                      filteredProjects.map((project) => (
                        <div
                          key={project.id}
                          className="project-card"
                          onClick={() => handleOpenProject(project)}
                        >
                          <div className="project-cover-placeholder" style={{ background: projectColor(project.id) }}>
                            <span className="cover-title">{project.name}</span>
                            <span className="cover-author">{project.author}</span>
                            <div className="cover-preset-tag">
                              <span className="format-badge">{project.preset === 'sixByNine' ? '6×9"' : project.preset.toUpperCase()}</span>
                            </div>
                          </div>
                          <div className="project-card-details">
                            <h3>{project.name}</h3>
                            <span className="project-author-label">Autor: {project.author}</span>
                            <div className="project-meta-info">
                              <span title={new Date(project.lastEditedIso).toLocaleString('pt-BR')}>{timeAgo(project.lastEditedIso)}</span>
                            </div>
                            <button
                              type="button"
                              className="project-btn-delete"
                              onClick={(e) => handleDeleteProject(project.id, e)}
                              title="Excluir livro"
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </main>

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                  <div className="confirm-modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
                    <div className="confirm-modal-window" onClick={(e) => e.stopPropagation()}>
                      <div className="confirm-modal-header">
                        <h3>Excluir projeto</h3>
                      </div>
                      <div className="confirm-modal-body">
                        <p>Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.</p>
                      </div>
                      <div className="confirm-modal-buttons">
                        <button type="button" className="confirm-modal-btn cancel" onClick={() => setShowDeleteConfirm(null)}>
                          Cancelar
                        </button>
                        <button type="button" className="confirm-modal-btn danger" onClick={confirmDeleteProject}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* New Project Wizard Modal */}
                {showWizard && (
                  <div className="wizard-overlay" onClick={() => setShowWizard(false)}>
                    <div className="wizard-window" onClick={(e) => e.stopPropagation()}>
                      <div className="wizard-header">
                        <h2>Criar Novo Manuscrito</h2>
                        <button type="button" className="wizard-close" onClick={() => setShowWizard(false)}>×</button>
                      </div>
                      <form onSubmit={handleCreateProject} className="wizard-form">
                        <div className="wizard-field">
                          <label htmlFor="title">Título do Livro</label>
                          <input
                            type="text"
                            id="title"
                            placeholder="Ex: O Pequeno Príncipe"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            required
                            autoFocus
                          />
                        </div>
                        
                        <div className="wizard-field">
                          <label htmlFor="author">Autor</label>
                          <input
                            type="text"
                            id="author"
                            placeholder="Ex: Antoine de Saint-Exupéry"
                            value={newAuthor}
                            onChange={(e) => setNewAuthor(e.target.value)}
                          />
                        </div>

                        <div className="wizard-field">
                          <label>Formato Físico do Miolo</label>
                          <div className="preset-card-selector">
                            <div
                              className={`preset-option-card ${newPreset === 'a5' ? 'active' : ''}`}
                              onClick={() => setNewPreset('a5')}
                            >
                              <div className="page-miniature size-a5"></div>
                              <span>A5 (Padrão)</span>
                              <span className="size-label">148×210 mm</span>
                            </div>
                            <div
                              className={`preset-option-card ${newPreset === 'sixByNine' ? 'active' : ''}`}
                              onClick={() => setNewPreset('sixByNine')}
                            >
                              <div className="page-miniature size-6x9"></div>
                              <span>6×9 polegadas</span>
                              <span className="size-label">152×229 mm</span>
                            </div>
                          </div>
                        </div>

                        <div className="wizard-buttons">
                          <button type="button" className="wizard-btn-cancel" onClick={() => setShowWizard(false)}>
                            Cancelar
                          </button>
                          <button type="submit" className="wizard-btn-submit">
                            Criar e Abrir Editor
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

          {screen === 'editor' && (
            <CanvasEditorShell onBack={handleBackToDashboard} onPersistProject={handlePersistActiveProject} />
          )}

          {screen === 'system-design' && (
            <SystemDesignPage onBack={() => setScreen('home')} />
          )}
      </div>
    </div>
  );
}
