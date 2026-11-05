import React, { useState, useEffect } from 'react';
import { Project, GeneratedQuery, SqlDialect, TableDefinition } from './types/schema';
import { DEFAULT_PROJECTS } from './data/defaultProjects';
import { MacMenuBar } from './components/macOS/MacMenuBar';
import { MacWindowFrame } from './components/macOS/MacWindowFrame';
import { Sidebar } from './components/Sidebar';
import { NaturalLanguageQueryView } from './components/NaturalLanguageQueryView';
import { SchemaDesignerView } from './components/SchemaDesignerView';
import { ERDiagramView } from './components/ERDiagramView';
import { RawDdlView } from './components/RawDdlView';
import { NewProjectModal } from './components/NewProjectModal';
import { ImportDdlModal } from './components/ImportDdlModal';
import { CommandPalette } from './components/CommandPalette';

const STORAGE_KEY = 'querycraft_projects_v2';
const ACTIVE_PROJ_KEY = 'querycraft_active_proj_id';

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load projects from storage:', e);
    }
    return DEFAULT_PROJECTS;
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_PROJ_KEY);
      if (saved) return saved;
    } catch {}
    return DEFAULT_PROJECTS[0].id;
  });

  const [activeView, setActiveView] = useState<'query' | 'schema' | 'er' | 'ddl'>('query');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [activeQuery, setActiveQuery] = useState<GeneratedQuery | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Modals
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isImportDdlOpen, setIsImportDdlOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Active project reference
  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0] || DEFAULT_PROJECTS[0];

  // Save projects to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      localStorage.setItem(ACTIVE_PROJ_KEY, activeProjectId);
    } catch (e) {
      console.error('Failed to save projects to storage:', e);
    }
  }, [projects, activeProjectId]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (!isCmd) return;

      if (e.key === '1') {
        e.preventDefault();
        setActiveView('query');
      } else if (e.key === '2') {
        e.preventDefault();
        setActiveView('schema');
      } else if (e.key === '3') {
        e.preventDefault();
        setActiveView('er');
      } else if (e.key === '4') {
        e.preventDefault();
        setActiveView('ddl');
      } else if (e.key === 'b') {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      } else if (e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        setIsNewProjectOpen(true);
      } else if (e.key === 't') {
        e.preventDefault();
        setActiveQuery(null);
        setActiveView('query');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleUpdateProject = (updatedProj: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updatedProj.id ? updatedProj : p)));
  };

  const handleCreateProject = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    setActiveTableId(newProject.tables[0]?.id || null);
    setActiveQuery(null);
    setActiveView('query');
  };

  const handleImportSchema = (
    projectName: string,
    dialect: SqlDialect,
    tables: TableDefinition[]
  ) => {
    const newProj: Project = {
      id: `proj-${Date.now()}`,
      name: projectName,
      description: 'Imported database schema',
      dialect,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tables,
      savedQueries: [],
      history: [],
    };
    handleCreateProject(newProj);
  };

  const handleChangeDialect = (dialect: SqlDialect) => {
    const updated = { ...activeProject, dialect, updatedAt: Date.now() };
    handleUpdateProject(updated);
  };

  const handleSaveQuery = (query: GeneratedQuery) => {
    const exists = activeProject.savedQueries.some((q) => q.id === query.id);
    let newSaved = [...activeProject.savedQueries];
    if (query.isFavorite) {
      if (!exists) newSaved.push(query);
    } else {
      newSaved = newSaved.filter((q) => q.id !== query.id);
    }
    const updated = { ...activeProject, savedQueries: newSaved, updatedAt: Date.now() };
    handleUpdateProject(updated);
  };

  const handleUpdateHistory = (query: GeneratedQuery) => {
    const newHistory = [query, ...activeProject.history.filter((h) => h.id !== query.id)].slice(
      0,
      30
    );
    const updated = { ...activeProject, history: newHistory, updatedAt: Date.now() };
    handleUpdateProject(updated);
  };

  const handleNewQuery = () => {
    setActiveQuery(null);
    setActiveView('query');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#121316]">
      {/* macOS Top System Menu Bar */}
      <MacMenuBar
        activeProjectName={activeProject.name}
        dialect={activeProject.dialect}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onNewProject={() => setIsNewProjectOpen(true)}
        onNewQuery={handleNewQuery}
        onSwitchView={setActiveView}
      />

      {/* Main macOS Application Window Frame */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        <MacWindowFrame
          activeView={activeView}
          onSwitchView={setActiveView}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          projects={projects}
          activeProject={activeProject}
          onSelectProject={(id) => {
            setActiveProjectId(id);
            const target = projects.find((p) => p.id === id);
            if (target && target.tables.length > 0) {
              setActiveTableId(target.tables[0].id);
            }
            setActiveQuery(null);
          }}
          onNewProject={() => setIsNewProjectOpen(true)}
          onImportDdl={() => setIsImportDdlOpen(true)}
          onChangeDialect={handleChangeDialect}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        >
          {/* Collapsible Sidebar */}
          {isSidebarOpen && (
            <Sidebar
              project={activeProject}
              activeTableId={activeTableId}
              onSelectTable={(tableId) => {
                setActiveTableId(tableId);
              }}
              onAddTable={() => {
                setActiveView('schema');
              }}
              onSelectQuery={(query) => {
                setActiveQuery(query);
                setActiveView('query');
              }}
              onNewQuery={handleNewQuery}
              onSwitchView={setActiveView}
              currentView={activeView}
            />
          )}

          {/* View Router */}
          <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative">
            {activeView === 'query' && (
              <NaturalLanguageQueryView
                project={activeProject}
                activeQuery={activeQuery}
                onSaveQuery={handleSaveQuery}
                onUpdateHistory={handleUpdateHistory}
              />
            )}

            {activeView === 'schema' && (
              <SchemaDesignerView
                project={activeProject}
                activeTableId={activeTableId}
                onSelectTable={(tableId) => setActiveTableId(tableId)}
                onUpdateProject={handleUpdateProject}
              />
            )}

            {activeView === 'er' && (
              <ERDiagramView
                project={activeProject}
                onSelectTable={(tableId) => {
                  setActiveTableId(tableId);
                }}
                onSwitchView={setActiveView}
              />
            )}

            {activeView === 'ddl' && <RawDdlView project={activeProject} />}
          </main>
        </MacWindowFrame>
      </div>

      {/* Modals */}
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onCreateProject={handleCreateProject}
      />

      <ImportDdlModal
        isOpen={isImportDdlOpen}
        onClose={() => setIsImportDdlOpen(false)}
        onImportSchema={handleImportSchema}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={(id) => {
          setActiveProjectId(id);
        }}
        onSwitchView={setActiveView}
        onNewProject={() => setIsNewProjectOpen(true)}
        onNewQuery={handleNewQuery}
        onChangeDialect={handleChangeDialect}
      />
    </div>
  );
}
