import React, { useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Database,
  Table2,
  Network,
  Code2,
  FolderPlus,
  FileUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  Check,
} from 'lucide-react';
import { Project, SqlDialect } from '../../types/schema';

interface MacWindowFrameProps {
  children: React.ReactNode;
  activeView: 'query' | 'schema' | 'er' | 'ddl';
  onSwitchView: (view: 'query' | 'schema' | 'er' | 'ddl') => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  projects: Project[];
  activeProject: Project;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onImportDdl: () => void;
  onChangeDialect: (dialect: SqlDialect) => void;
  onOpenCommandPalette: () => void;
}

export const MacWindowFrame: React.FC<MacWindowFrameProps> = ({
  children,
  activeView,
  onSwitchView,
  isSidebarOpen,
  onToggleSidebar,
  projects,
  activeProject,
  onSelectProject,
  onNewProject,
  onImportDdl,
  onChangeDialect,
  onOpenCommandPalette,
}) => {
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isDialectDropdownOpen, setIsDialectDropdownOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dialects: SqlDialect[] = ['PostgreSQL', 'MySQL', 'SQLite', 'SQL Server', 'BigQuery'];

  return (
    <div className={`flex flex-col h-full w-full bg-[#1e1e24] text-[#e5e7eb] select-none ${isFullscreen ? 'p-0' : 'p-1.5 md:p-2'} transition-all`}>
      {/* Outer Window Container with macOS drop shadow and rounded corners */}
      <div className="flex flex-col flex-1 w-full bg-[#18181d] border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl relative">
        {/* macOS Titlebar & Unified Toolbar */}
        <div className="h-12 bg-[#202027]/95 border-b border-white/[0.08] flex items-center justify-between px-3.5 z-30 shrink-0">
          {/* Left: Window Traffic Lights & Sidebar Toggle */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 mr-1">
              <button
                className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] traffic-light hover:brightness-110 flex items-center justify-center group"
                onClick={() => {}}
                title="Close Window"
              >
                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-[#4d0000] font-bold">×</span>
              </button>
              <button
                className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] traffic-light hover:brightness-110 flex items-center justify-center group"
                onClick={() => {}}
                title="Minimize Window"
              >
                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-[#593b00] font-bold">−</span>
              </button>
              <button
                className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29] traffic-light hover:brightness-110 flex items-center justify-center group"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title="Toggle Fullscreen"
              >
                <span className="opacity-0 group-hover:opacity-100 text-[7px] text-[#004d0d] font-bold">⤢</span>
              </button>
            </div>

            <button
              onClick={onToggleSidebar}
              className="p-1.5 hover:bg-white/[0.07] rounded-md text-white/60 hover:text-white transition"
              title={isSidebarOpen ? 'Hide Sidebar (⌘B)' : 'Show Sidebar (⌘B)'}
            >
              {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>

            {/* Active Project Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition text-[12px] font-medium"
              >
                <Database className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-white font-semibold max-w-[140px] truncate">{activeProject.name}</span>
                <span className="text-[10px] text-white/40 font-mono">({activeProject.tables.length} tables)</span>
                <ChevronDown className="w-3 h-3 text-white/40" />
              </button>

              {isProjectDropdownOpen && (
                <div
                  className="absolute left-0 top-9 w-64 bg-[#23232c] border border-white/10 rounded-lg shadow-2xl py-1 z-50 text-[12px]"
                  onMouseLeave={() => setIsProjectDropdownOpen(false)}
                >
                  <div className="px-3 py-1 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    Database Projects
                  </div>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        onSelectProject(p.id);
                        setIsProjectDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-blue-600 flex items-center justify-between group"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <Database className="w-3.5 h-3.5 text-blue-400 group-hover:text-white" />
                        <span className="font-medium text-white truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="text-[10px] text-white/50 group-hover:text-white/80 font-mono">{p.dialect}</span>
                        {p.id === activeProject.id && <Check className="w-3.5 h-3.5 text-blue-400 group-hover:text-white" />}
                      </div>
                    </button>
                  ))}
                  <div className="h-[1px] bg-white/10 my-1" />
                  <button
                    onClick={() => {
                      onNewProject();
                      setIsProjectDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-blue-400 hover:text-blue-300 flex items-center space-x-2"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Create New Project…</span>
                  </button>
                  <button
                    onClick={() => {
                      onImportDdl();
                      setIsProjectDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-white/70 hover:text-white flex items-center space-x-2"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span>Import SQL DDL Schema…</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Center: macOS Segmented View Control */}
          <div className="hidden sm:flex items-center p-0.5 bg-black/30 rounded-lg border border-white/[0.08] shadow-inner">
            <button
              onClick={() => onSwitchView('query')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-[12px] font-medium transition ${
                activeView === 'query'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Ask in English</span>
            </button>
            <button
              onClick={() => onSwitchView('schema')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-[12px] font-medium transition ${
                activeView === 'schema'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Schema Designer</span>
            </button>
            <button
              onClick={() => onSwitchView('er')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-[12px] font-medium transition ${
                activeView === 'er'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>ER Diagram</span>
            </button>
            <button
              onClick={() => onSwitchView('ddl')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-[12px] font-medium transition ${
                activeView === 'ddl'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Raw DDL</span>
            </button>
          </div>

          {/* Right: Dialect Selector & Actions */}
          <div className="flex items-center space-x-2">
            {/* Dialect Picker */}
            <div className="relative">
              <button
                onClick={() => setIsDialectDropdownOpen(!isDialectDropdownOpen)}
                className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.06] text-[11px] font-mono text-white/80 transition"
              >
                <span>{activeProject.dialect}</span>
                <ChevronDown className="w-3 h-3 text-white/40" />
              </button>

              {isDialectDropdownOpen && (
                <div
                  className="absolute right-0 top-8 w-36 bg-[#23232c] border border-white/10 rounded-lg shadow-2xl py-1 z-50 text-[11px] font-mono"
                  onMouseLeave={() => setIsDialectDropdownOpen(false)}
                >
                  <div className="px-2 py-0.5 text-[9px] uppercase tracking-wider text-white/40">
                    Dialect
                  </div>
                  {dialects.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        onChangeDialect(d);
                        setIsDialectDropdownOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1 hover:bg-blue-600 flex items-center justify-between"
                    >
                      <span>{d}</span>
                      {d === activeProject.dialect && <Check className="w-3 h-3 text-white" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onOpenCommandPalette}
              className="p-1.5 hover:bg-white/[0.08] rounded-md text-white/60 hover:text-white transition"
              title="Command Palette (⌘K)"
            >
              <span className="text-[11px] font-mono bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.08]">
                ⌘K
              </span>
            </button>
          </div>
        </div>

        {/* Window Content */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          {children}
        </div>
      </div>
    </div>
  );
};
