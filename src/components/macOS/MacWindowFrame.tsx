import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Code2, Database, FileUp, FolderPlus, Menu, Network, PanelLeftClose, PanelLeftOpen, Sparkles, Table2, Trash2, X } from 'lucide-react';
import { Project, SqlDialect } from '../../types/schema';

type View = 'query' | 'schema' | 'er' | 'ddl';

interface MacWindowFrameProps {
  children: React.ReactNode;
  activeView: View;
  onSwitchView: (view: View) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  projects: Project[];
  activeProject: Project;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void | Promise<void>;
  onNewProject: () => void;
  onImportDdl: () => void;
  onChangeDialect: (dialect: SqlDialect) => void;
  onOpenCommandPalette: () => void;
}

const views = [
  { id: 'query' as const, label: 'Ask AI', icon: Sparkles },
  { id: 'schema' as const, label: 'Schema', icon: Table2 },
  { id: 'er' as const, label: 'Relationships', icon: Network },
  { id: 'ddl' as const, label: 'SQL definition', icon: Code2 },
];

export const MacWindowFrame: React.FC<MacWindowFrameProps> = ({
  children, activeView, onSwitchView, isSidebarOpen, onToggleSidebar, projects,
  activeProject, onSelectProject, onDeleteProject, onNewProject, onImportDdl, onChangeDialect,
}) => {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] = useState<string | null>(null);
  const [projectBeingDeleted, setProjectBeingDeleted] = useState<string | null>(null);
  const [dialectMenuOpen, setDialectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const dialectMenuRef = useRef<HTMLDivElement>(null);
  const dialects: SqlDialect[] = ['PostgreSQL', 'MySQL', 'SQLite', 'SQL Server', 'BigQuery'];

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!projectMenuRef.current?.contains(target)) {
        setProjectMenuOpen(false);
        setProjectPendingDelete(null);
      }
      if (!dialectMenuRef.current?.contains(target)) setDialectMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeMenus);
    return () => window.removeEventListener('pointerdown', closeMenus);
  }, []);

  return (
    <div className="workspace-frame">
      <div className="workspace-toolbar">
        <div className="toolbar-leading">
          <button type="button" className="icon-action" onClick={onToggleSidebar} title={isSidebarOpen ? 'Hide sidebar (⌘B)' : 'Show sidebar (⌘B)'} aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
            {isSidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
          <div className="menu-wrap" ref={projectMenuRef}>
            <button type="button" className="project-switcher" onClick={() => setProjectMenuOpen((open) => !open)} aria-expanded={projectMenuOpen}>
              <span className="project-icon"><Database /></span>
              <span className="project-copy"><small>Workspace</small><strong>{activeProject.name}</strong></span>
              <span className="table-count">{activeProject.tables.length} tables</span><ChevronDown />
            </button>
            {projectMenuOpen && (
              <div className="floating-menu project-menu">
                <p className="menu-label">Your workspaces</p>
                {projects.map((project) => (
                  <React.Fragment key={project.id}>
                    <div className="project-menu-entry">
                      <button type="button" className="project-menu-select" onClick={() => { onSelectProject(project.id); setProjectMenuOpen(false); }}>
                        <span className="project-icon"><Database /></span>
                        <span className="menu-project-copy"><strong>{project.name}</strong><small>{project.dialect} · {project.tables.length} tables</small></span>
                        {project.id === activeProject.id && <Check className="menu-check" />}
                      </button>
                      {projects.length > 1 && (
                        <button
                          type="button"
                          className="project-delete-trigger"
                          onClick={() => setProjectPendingDelete(project.id)}
                          aria-label={`Remove ${project.name}`}
                          title="Remove saved database"
                        >
                          <Trash2 />
                        </button>
                      )}
                    </div>
                    {projectPendingDelete === project.id && (
                      <div className="project-delete-confirm" role="alert">
                        <div>
                          <strong>Remove “{project.name}”?</strong>
                          <span>This clears its saved schema and query history from this browser. The real database is not deleted.</span>
                        </div>
                        <div className="project-delete-actions">
                          <button type="button" onClick={() => setProjectPendingDelete(null)}><X /> Cancel</button>
                          <button
                            type="button"
                            className="confirm-delete"
                            disabled={projectBeingDeleted === project.id}
                            onClick={async () => {
                              setProjectBeingDeleted(project.id);
                              await onDeleteProject(project.id);
                              setProjectBeingDeleted(null);
                              setProjectPendingDelete(null);
                              setProjectMenuOpen(false);
                            }}
                          >
                            <Trash2 /> {projectBeingDeleted === project.id ? 'Removing…' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
                <div className="menu-separator" />
                <button type="button" onClick={() => { onNewProject(); setProjectMenuOpen(false); }}><FolderPlus /> Create workspace</button>
                <button type="button" onClick={() => { onImportDdl(); setProjectMenuOpen(false); }}><FileUp /> Import schema</button>
              </div>
            )}
          </div>
        </div>
        <nav className="view-tabs" aria-label="Workspace views">
          {views.map(({ id, label, icon: Icon }) => (
            <button type="button" key={id} onClick={() => onSwitchView(id)} className={activeView === id ? 'is-active' : ''} aria-current={activeView === id ? 'page' : undefined}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="toolbar-trailing">
          <div className="menu-wrap" ref={dialectMenuRef}>
            <button type="button" className="dialect-switcher" onClick={() => setDialectMenuOpen((open) => !open)} aria-expanded={dialectMenuOpen}>
              <span className="status-dot" />{activeProject.dialect}<ChevronDown />
            </button>
            {dialectMenuOpen && (
              <div className="floating-menu dialect-menu">
                <p className="menu-label">SQL dialect</p>
                {dialects.map((dialect) => (
                  <button type="button" key={dialect} onClick={() => { onChangeDialect(dialect); setDialectMenuOpen(false); }}>
                    <span>{dialect}</span>{dialect === activeProject.dialect && <Check className="menu-check" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="mobile-menu-action" aria-label="Open navigation"><Menu /></button>
        </div>
      </div>
      <div className="workspace-content">{children}</div>
    </div>
  );
};
