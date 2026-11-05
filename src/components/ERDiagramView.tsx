import React, { useState } from 'react';
import {
  Layers,
  KeyRound,
  Link,
  Table2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Sparkles,
} from 'lucide-react';
import { Project, TableDefinition } from '../types/schema';

interface ERDiagramViewProps {
  project: Project;
  onSelectTable: (tableId: string) => void;
  onSwitchView: (view: 'query' | 'schema' | 'er' | 'ddl') => void;
}

export const ERDiagramView: React.FC<ERDiagramViewProps> = ({
  project,
  onSelectTable,
  onSwitchView,
}) => {
  const [zoom, setZoom] = useState(1);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Collect relationships
  const relationships: { fromTable: string; fromCol: string; toTable: string; toCol: string }[] = [];
  project.tables.forEach((t) => {
    t.columns.forEach((c) => {
      if (c.references) {
        relationships.push({
          fromTable: t.name,
          fromCol: c.name,
          toTable: c.references.table,
          toCol: c.references.column,
        });
      }
    });
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#18181f] overflow-hidden select-none">
      {/* ER Diagram Toolbar */}
      <div className="h-10 bg-[#202028] border-b border-white/[0.08] px-4 flex items-center justify-between text-xs text-white/70 shrink-0">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-white">Entity-Relationship Visualizer</span>
          <span className="text-[10px] font-mono text-white/40">
            {project.tables.length} entities • {relationships.length} foreign key relationships
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoom((prev) => Math.max(0.7, prev - 0.1))}
            className="p-1 hover:bg-white/[0.08] rounded text-white/60 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-white/40">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((prev) => Math.min(1.4, prev + 0.1))}
            className="p-1 hover:bg-white/[0.08] rounded text-white/60 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-1 hover:bg-white/[0.08] rounded text-white/60 hover:text-white"
            title="Reset Zoom"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 overflow-auto p-6 md:p-8 bg-[#141418] relative flex flex-col">
        {/* Relationship Summary Banner */}
        {relationships.length > 0 && (
          <div className="mb-6 p-3 rounded-lg bg-[#1e1e28] border border-white/[0.08] text-xs flex flex-wrap items-center gap-2 max-w-4xl">
            <span className="font-semibold text-white/60 flex items-center space-x-1">
              <Link className="w-3 h-3 text-purple-400" />
              <span>Foreign Key Links:</span>
            </span>
            {relationships.map((rel, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 font-mono text-[11px] text-purple-300"
              >
                {rel.fromTable}.{rel.fromCol} ➔ {rel.toTable}.{rel.toCol}
              </span>
            ))}
          </div>
        )}

        {/* Tables Grid Layout */}
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-transform max-w-6xl"
        >
          {project.tables.map((table) => {
            const isHighlight = selectedTable === table.name;
            const hasOutgoing = relationships.some((r) => r.fromTable === table.name);
            const hasIncoming = relationships.some((r) => r.toTable === table.name);

            return (
              <div
                key={table.id}
                onClick={() => setSelectedTable(selectedTable === table.name ? null : table.name)}
                className={`bg-[#20202a] border rounded-xl overflow-hidden shadow-xl transition cursor-pointer hover:border-blue-500/50 ${
                  isHighlight
                    ? 'border-blue-500 ring-2 ring-blue-500/30'
                    : 'border-white/[0.08]'
                }`}
              >
                {/* Table Header */}
                <div className="h-10 bg-[#262633] border-b border-white/[0.08] px-3.5 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Table2 className="w-4 h-4 text-blue-400" />
                    <span className="font-bold text-white text-xs font-mono">{table.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTable(table.id);
                      onSwitchView('schema');
                    }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    Edit
                  </button>
                </div>

                {/* Columns List */}
                <div className="divide-y divide-white/[0.04] text-xs font-mono">
                  {table.columns.map((col) => (
                    <div
                      key={col.name}
                      className="px-3.5 py-1.5 flex items-center justify-between hover:bg-white/[0.03] transition"
                    >
                      <div className="flex items-center space-x-2">
                        {col.isPrimary ? (
                          <span title="Primary Key">
                            <KeyRound className="w-3 h-3 text-amber-400" />
                          </span>
                        ) : col.references ? (
                          <span title={`Foreign Key: references ${col.references.table}.${col.references.column}`}>
                            <Link className="w-3 h-3 text-purple-400" />
                          </span>
                        ) : (
                          <span className="w-3 h-3 block rounded-full bg-white/10" />
                        )}
                        <span className={`text-white/90 ${col.isPrimary ? 'font-semibold text-white' : ''}`}>
                          {col.name}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5 text-[10px]">
                        <span className="text-white/40">{col.type}</span>
                        {col.references && (
                          <span className="text-purple-400 text-[9px] bg-purple-950/40 px-1 rounded border border-purple-800/40">
                            ➔ {col.references.table}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer notes */}
                <div className="p-2 bg-black/20 text-[10px] text-white/40 flex items-center justify-between border-t border-white/[0.04]">
                  <span>{table.columns.length} columns</span>
                  <span>{table.sampleData?.length || 0} mock records</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
