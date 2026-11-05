import React, { useState, useEffect } from 'react';
import {
  Search,
  Sparkles,
  Table2,
  Network,
  Code2,
  FolderPlus,
  Database,
  ArrowRight,
  X,
} from 'lucide-react';
import { Project, SqlDialect } from '../types/schema';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  activeProject: Project;
  onSelectProject: (id: string) => void;
  onSwitchView: (view: 'query' | 'schema' | 'er' | 'ddl') => void;
  onNewProject: () => void;
  onNewQuery: () => void;
  onChangeDialect: (dialect: SqlDialect) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  projects,
  activeProject,
  onSelectProject,
  onSwitchView,
  onNewProject,
  onNewQuery,
  onChangeDialect,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'ask',
      title: 'Ask in English (Natural Language to SQL)',
      icon: <Sparkles className="w-4 h-4 text-amber-300" />,
      shortcut: '⌘1',
      action: () => {
        onNewQuery();
        onSwitchView('query');
        onClose();
      },
    },
    {
      id: 'schema',
      title: 'Open Schema Designer',
      icon: <Table2 className="w-4 h-4 text-blue-400" />,
      shortcut: '⌘2',
      action: () => {
        onSwitchView('schema');
        onClose();
      },
    },
    {
      id: 'er',
      title: 'View ER Diagram Relationships',
      icon: <Network className="w-4 h-4 text-emerald-400" />,
      shortcut: '⌘3',
      action: () => {
        onSwitchView('er');
        onClose();
      },
    },
    {
      id: 'ddl',
      title: 'Export Schema / Raw SQL DDL',
      icon: <Code2 className="w-4 h-4 text-purple-400" />,
      shortcut: '⌘4',
      action: () => {
        onSwitchView('ddl');
        onClose();
      },
    },
    {
      id: 'new_proj',
      title: 'Create New Database Project',
      icon: <FolderPlus className="w-4 h-4 text-blue-400" />,
      shortcut: '⌘N',
      action: () => {
        onNewProject();
        onClose();
      },
    },
  ];

  const filteredActions = actions.filter((a) =>
    a.title.toLowerCase().includes(query.toLowerCase())
  );

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
      <div className="w-full max-w-lg bg-[#202029] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search Input */}
        <div className="p-3 border-b border-white/[0.08] flex items-center space-x-3 bg-[#242432]">
          <Search className="w-4 h-4 text-white/40 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, query, or table name…"
            className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[10px] text-white/40 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-3 text-xs">
          {/* Actions */}
          <div>
            <div className="px-2.5 py-1 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              Actions
            </div>
            <div className="space-y-0.5 mt-0.5">
              {filteredActions.map((act) => (
                <button
                  key={act.id}
                  onClick={act.action}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-600 text-white/80 hover:text-white transition group text-left"
                >
                  <div className="flex items-center space-x-2.5">
                    {act.icon}
                    <span className="font-medium text-white">{act.title}</span>
                  </div>
                  <span className="text-[10px] text-white/40 group-hover:text-white/80 font-mono">
                    {act.shortcut}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Switch Projects */}
          <div>
            <div className="px-2.5 py-1 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              Switch Database Project
            </div>
            <div className="space-y-0.5 mt-0.5">
              {filteredProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectProject(p.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-600 text-white/80 hover:text-white transition group text-left"
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <Database className="w-4 h-4 text-blue-400 group-hover:text-white" />
                    <span className="font-medium text-white truncate">{p.name}</span>
                    {p.id === activeProject.id && (
                      <span className="text-[9px] px-1.5 py-0.2 bg-white/20 rounded text-white font-mono">
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/40 group-hover:text-white/80 font-mono">
                    {p.dialect}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
