import React, { useState } from 'react';
import {
  Table2,
  Plus,
  Search,
  Database,
  History,
  Star,
  ChevronRight,
  ChevronDown,
  Sparkles,
  KeyRound,
  FileCode,
  Layers,
  Settings2,
  Trash2,
} from 'lucide-react';
import { Project, TableDefinition, GeneratedQuery } from '../types/schema';

interface SidebarProps {
  project: Project;
  activeTableId: string | null;
  onSelectTable: (tableId: string) => void;
  onAddTable: () => void;
  onSelectQuery: (query: GeneratedQuery) => void;
  onNewQuery: () => void;
  onDeleteTable?: (tableId: string) => void;
  onSwitchView: (view: 'query' | 'schema' | 'er' | 'ddl') => void;
  currentView: 'query' | 'schema' | 'er' | 'ddl';
}

export const Sidebar: React.FC<SidebarProps> = ({
  project,
  activeTableId,
  onSelectTable,
  onAddTable,
  onSelectQuery,
  onNewQuery,
  onDeleteTable,
  onSwitchView,
  currentView,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tablesExpanded, setTablesExpanded] = useState(true);
  const [savedExpanded, setSavedExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const filteredTables = project.tables.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.columns.some((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalColumns = project.tables.reduce((acc, t) => acc + t.columns.length, 0);
  const totalRows = project.tables.reduce((acc, t) => acc + (t.sampleData?.length || 0), 0);

  return (
    <aside className="schema-sidebar">
      {/* Top Search bar */}
      <div className="sidebar-search-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-white/40" />
          <input
            type="text"
            placeholder="Search tables & columns…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="sidebar-search"
          />
        </div>
      </div>

      {/* Navigation list */}
      <div className="sidebar-scroll">
        {/* Quick Views */}
        <div className="space-y-0.5">
          <button
            onClick={() => {
              onNewQuery();
              onSwitchView('query');
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition ${
              currentView === 'query'
                ? 'bg-blue-600/90 text-white shadow-sm'
                : 'text-white/80 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Ask in English</span>
            </div>
            <span className="text-[10px] opacity-60 font-mono">⌘1</span>
          </button>

          <button
            onClick={() => onSwitchView('schema')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition ${
              currentView === 'schema'
                ? 'bg-blue-600/90 text-white shadow-sm'
                : 'text-white/80 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Table2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Schema Designer</span>
            </div>
            <span className="text-[10px] opacity-60 font-mono">⌘2</span>
          </button>

          <button
            onClick={() => onSwitchView('er')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition ${
              currentView === 'er'
                ? 'bg-blue-600/90 text-white shadow-sm'
                : 'text-white/80 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>ER Diagram</span>
            </div>
            <span className="text-[10px] opacity-60 font-mono">⌘3</span>
          </button>
        </div>

        {/* Database Tables Section */}
        <div>
          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            <button
              onClick={() => setTablesExpanded(!tablesExpanded)}
              className="flex items-center space-x-1 hover:text-white/70 transition"
            >
              {tablesExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>Tables ({project.tables.length})</span>
            </button>
            <button
              onClick={onAddTable}
              className="p-1 hover:bg-white/10 rounded text-blue-400 hover:text-blue-300 transition"
              title="Add New Table"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {tablesExpanded && (
            <div className="mt-1 space-y-0.5">
              {filteredTables.map((table) => {
                const isSelected = activeTableId === table.id && currentView === 'schema';
                const pkCount = table.columns.filter((c) => c.isPrimary).length;
                const fkCount = table.columns.filter((c) => c.references).length;

                return (
                  <div
                    key={table.id}
                    onClick={() => {
                      onSelectTable(table.id);
                      onSwitchView('schema');
                    }}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition ${
                      isSelected
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-white/75 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <Table2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-blue-400'}`} />
                      <span className="truncate">{table.name}</span>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 text-[10px]">
                      {fkCount > 0 && (
                        <span
                          className={`px-1 py-0.2 rounded font-mono ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-purple-500/20 text-purple-300'
                          }`}
                          title={`${fkCount} foreign key(s)`}
                        >
                          FK:{fkCount}
                        </span>
                      )}
                      <span
                        className={`font-mono px-1 py-0.2 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-white/50'
                        }`}
                      >
                        {table.columns.length}c
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredTables.length === 0 && (
                <div className="px-3 py-2 text-xs text-white/40 italic">
                  No tables match search
                </div>
              )}
            </div>
          )}
        </div>

        {/* Saved Queries */}
        {project.savedQueries.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              <button
                onClick={() => setSavedExpanded(!savedExpanded)}
                className="flex items-center space-x-1 hover:text-white/70 transition"
              >
                {savedExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span>Saved Queries ({project.savedQueries.length})</span>
              </button>
            </div>

            {savedExpanded && (
              <div className="mt-1 space-y-0.5">
                {project.savedQueries.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      onSelectQuery(q);
                      onSwitchView('query');
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md text-white/75 hover:bg-white/[0.05] hover:text-white transition flex items-center space-x-2 group"
                  >
                    <Star className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400" />
                    <span className="truncate text-xs flex-1">{q.prompt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Query History */}
        {project.history.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              <button
                onClick={() => setHistoryExpanded(!historyExpanded)}
                className="flex items-center space-x-1 hover:text-white/70 transition"
              >
                {historyExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span>History ({project.history.length})</span>
              </button>
            </div>

            {historyExpanded && (
              <div className="mt-1 space-y-0.5">
                {project.history.slice(0, 10).map((q) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      onSelectQuery(q);
                      onSwitchView('query');
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md text-white/60 hover:bg-white/[0.05] hover:text-white transition flex items-center space-x-2"
                  >
                    <History className="w-3 h-3 text-white/40 shrink-0" />
                    <span className="truncate text-xs">{q.prompt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Status & Summary */}
      <div className="p-2.5 border-t border-white/[0.08] bg-black/20 text-[11px] text-white/50 space-y-1">
        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-white/70 font-medium">SQLite Engine</span>
          </span>
          <span className="text-white/40 font-mono">{totalRows} mock rows</span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-white/40 font-mono">
          <span>{project.tables.length} tables • {totalColumns} cols</span>
          <span>{project.dialect}</span>
        </div>
      </div>
    </aside>
  );
};
