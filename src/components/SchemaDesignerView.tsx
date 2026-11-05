import React, { useState } from 'react';
import {
  Table2,
  Plus,
  Trash2,
  KeyRound,
  Link,
  Sparkles,
  Save,
  Check,
  Database,
  Layers,
  Edit2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ColumnDefinition, Project, TableDefinition } from '../types/schema';
import { requestSchemaGeneration } from '../services/api';

interface SchemaDesignerViewProps {
  project: Project;
  activeTableId: string | null;
  onSelectTable: (tableId: string) => void;
  onUpdateProject: (updated: Project) => void;
}

export const SchemaDesignerView: React.FC<SchemaDesignerViewProps> = ({
  project,
  activeTableId,
  onSelectTable,
  onUpdateProject,
}) => {
  const [selectedTableId, setSelectedTableId] = useState<string>(
    activeTableId || (project.tables[0]?.id ?? '')
  );
  const [activeTab, setActiveTab] = useState<'columns' | 'data'>('columns');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isGeneratingMock, setIsGeneratingMock] = useState(false);

  // Sync selected table if activeTableId changes from sidebar
  React.useEffect(() => {
    if (activeTableId) {
      setSelectedTableId(activeTableId);
    }
  }, [activeTableId]);

  const currentTable = project.tables.find((t) => t.id === selectedTableId) || project.tables[0];

  const handleUpdateTable = (updatedTable: TableDefinition) => {
    const newTables = project.tables.map((t) => (t.id === updatedTable.id ? updatedTable : t));
    const updatedProj = { ...project, tables: newTables, updatedAt: Date.now() };
    onUpdateProject(updatedProj);
    triggerSaveToast();
  };

  const handleAddTable = () => {
    const newId = `tbl-${Date.now()}`;
    const newTable: TableDefinition = {
      id: newId,
      name: `table_${project.tables.length + 1}`,
      description: 'New database table',
      columns: [
        { name: 'id', type: 'INTEGER', isPrimary: true, isNullable: false },
        { name: 'created_at', type: 'TIMESTAMP', defaultValue: 'NOW()' },
      ],
      sampleData: [{ id: 1, created_at: new Date().toISOString() }],
    };

    const updatedProj = {
      ...project,
      tables: [...project.tables, newTable],
      updatedAt: Date.now(),
    };
    onUpdateProject(updatedProj);
    setSelectedTableId(newId);
    onSelectTable(newId);
    triggerSaveToast();
  };

  const handleDeleteTable = (tableId: string) => {
    if (project.tables.length <= 1) {
      alert('A project must contain at least one table.');
      return;
    }
    const filtered = project.tables.filter((t) => t.id !== tableId);
    const updatedProj = { ...project, tables: filtered, updatedAt: Date.now() };
    onUpdateProject(updatedProj);
    setSelectedTableId(filtered[0].id);
    onSelectTable(filtered[0].id);
    triggerSaveToast();
  };

  const handleAddColumn = () => {
    if (!currentTable) return;
    const newCol: ColumnDefinition = {
      name: `col_${currentTable.columns.length + 1}`,
      type: 'VARCHAR(255)',
      isNullable: true,
    };
    const updatedTable = {
      ...currentTable,
      columns: [...currentTable.columns, newCol],
    };
    handleUpdateTable(updatedTable);
  };

  const handleUpdateColumn = (index: number, updatedCol: ColumnDefinition) => {
    if (!currentTable) return;
    const newCols = [...currentTable.columns];
    newCols[index] = updatedCol;
    handleUpdateTable({ ...currentTable, columns: newCols });
  };

  const handleDeleteColumn = (index: number) => {
    if (!currentTable || currentTable.columns.length <= 1) return;
    const newCols = currentTable.columns.filter((_, i) => i !== index);
    handleUpdateTable({ ...currentTable, columns: newCols });
  };

  const triggerSaveToast = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Generate realistic mock data for current table with Gemini
  const handleGenerateSampleData = async () => {
    if (!currentTable) return;
    setIsGeneratingMock(true);
    try {
      const res = await requestSchemaGeneration(
        `Generate 5 realistic test seed data rows for table ${currentTable.name} with columns ${currentTable.columns
          .map((c) => `${c.name} (${c.type})`)
          .join(', ')}. Return strictly realistic rows.`,
        project.dialect
      );
      const generatedTable = res.tables.find(
        (t) => t.name.toLowerCase() === currentTable.name.toLowerCase()
      ) || res.tables[0];

      if (generatedTable && generatedTable.sampleData) {
        handleUpdateTable({
          ...currentTable,
          sampleData: generatedTable.sampleData,
        });
      }
    } catch (err: any) {
      console.error('Error generating sample data:', err);
    } finally {
      setIsGeneratingMock(false);
    }
  };

  const handleAddRow = () => {
    if (!currentTable) return;
    const newRow: Record<string, any> = {};
    currentTable.columns.forEach((c) => {
      if (c.isPrimary) newRow[c.name] = (currentTable.sampleData?.length || 0) + 1;
      else if (c.type.includes('INT')) newRow[c.name] = 0;
      else if (c.type.includes('BOOL')) newRow[c.name] = false;
      else newRow[c.name] = 'sample';
    });
    const updatedData = [...(currentTable.sampleData || []), newRow];
    handleUpdateTable({ ...currentTable, sampleData: updatedData });
  };

  const dataTypes = [
    'INTEGER',
    'BIGINT',
    'SERIAL',
    'VARCHAR(100)',
    'VARCHAR(255)',
    'TEXT',
    'NUMERIC(10,2)',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
    'UUID',
    'JSONB',
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#18181f] overflow-hidden">
      {/* Top Header & Table Selector Tabs */}
      <div className="h-12 bg-[#202028] border-b border-white/[0.08] px-4 flex items-center justify-between shrink-0">
        {/* Table Selector Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto max-w-2xl py-1">
          {project.tables.map((t) => {
            const isSelected = t.id === currentTable?.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTableId(t.id);
                  onSelectTable(t.id);
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition shrink-0 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Table2 className="w-3 h-3 text-blue-300" />
                <span>{t.name}</span>
                <span className="text-[10px] opacity-70">({t.columns.length})</span>
              </button>
            );
          })}

          <button
            onClick={handleAddTable}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white text-xs transition shrink-0"
            title="Create New Table"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>Table</span>
          </button>
        </div>

        {/* Save Status & Table Actions */}
        <div className="flex items-center space-x-2 shrink-0">
          {saveSuccess && (
            <span className="flex items-center space-x-1 text-emerald-400 text-xs font-medium">
              <Check className="w-3.5 h-3.5" />
              <span>Saved</span>
            </span>
          )}

          {currentTable && (
            <button
              onClick={() => handleDeleteTable(currentTable.id)}
              className="p-1.5 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded-md transition"
              title="Delete Current Table"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {currentTable ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4 md:p-6 space-y-4">
          {/* Table Meta Card */}
          <div className="bg-[#202029] border border-white/[0.08] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md shrink-0">
            <div className="space-y-1 flex-1">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={currentTable.name}
                  onChange={(e) =>
                    handleUpdateTable({
                      ...currentTable,
                      name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                    })
                  }
                  className="bg-black/30 border border-white/[0.1] rounded px-2.5 py-1 text-sm font-semibold text-white focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="table_name"
                />
                <span className="text-[11px] font-mono text-white/40">
                  {currentTable.columns.length} columns • {currentTable.sampleData?.length || 0} sample rows
                </span>
              </div>
              <input
                type="text"
                value={currentTable.description || ''}
                onChange={(e) =>
                  handleUpdateTable({ ...currentTable, description: e.target.value })
                }
                className="w-full bg-transparent border-b border-white/[0.05] focus:border-blue-500 text-xs text-white/60 focus:text-white focus:outline-none py-0.5"
                placeholder="Table description or notes…"
              />
            </div>

            {/* Segmented Columns / Data Toggle */}
            <div className="flex items-center p-0.5 bg-black/40 rounded-lg border border-white/[0.08]">
              <button
                onClick={() => setActiveTab('columns')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === 'columns' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                Columns & Constraints
              </button>
              <button
                onClick={() => setActiveTab('data')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                  activeTab === 'data' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                Mock Data ({currentTable.sampleData?.length || 0})
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'columns' ? (
            <div className="flex-1 bg-[#1e1e26] border border-white/[0.08] rounded-xl flex flex-col min-h-0 overflow-hidden shadow-lg">
              <div className="h-10 bg-[#252530] border-b border-white/[0.08] px-4 flex items-center justify-between text-xs text-white/70 font-semibold shrink-0">
                <span>Columns Configuration</span>
                <button
                  onClick={handleAddColumn}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Column</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {currentTable.columns.map((col, index) => (
                  <div
                    key={index}
                    className="p-3 bg-black/20 hover:bg-black/30 border border-white/[0.06] rounded-lg flex flex-wrap items-center gap-3 text-xs transition"
                  >
                    {/* Column Name */}
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[10px] text-white/40 uppercase mb-0.5">Name</label>
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) =>
                          handleUpdateColumn(index, {
                            ...col,
                            name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                          })
                        }
                        className="w-full bg-white/[0.05] border border-white/[0.08] rounded px-2 py-1 text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Column Type */}
                    <div className="w-36">
                      <label className="block text-[10px] text-white/40 uppercase mb-0.5">Type</label>
                      <select
                        value={col.type}
                        onChange={(e) => handleUpdateColumn(index, { ...col, type: e.target.value })}
                        className="w-full bg-[#181820] border border-white/[0.08] rounded px-2 py-1 text-white font-mono focus:outline-none focus:border-blue-500"
                      >
                        {dataTypes.map((dt) => (
                          <option key={dt} value={dt}>
                            {dt}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Checkboxes: PK, Nullable, Unique */}
                    <div className="flex items-center space-x-3 pt-4">
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!col.isPrimary}
                          onChange={(e) =>
                            handleUpdateColumn(index, { ...col, isPrimary: e.target.checked })
                          }
                          className="rounded border-white/20 text-blue-500 focus:ring-0"
                        />
                        <span className="text-[11px] font-medium text-amber-300 flex items-center space-x-0.5">
                          <KeyRound className="w-3 h-3 text-amber-400" />
                          <span>PK</span>
                        </span>
                      </label>

                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!col.isNullable}
                          onChange={(e) =>
                            handleUpdateColumn(index, { ...col, isNullable: e.target.checked })
                          }
                          className="rounded border-white/20 text-blue-500 focus:ring-0"
                        />
                        <span className="text-[11px] text-white/60">Nullable</span>
                      </label>

                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!col.isUnique}
                          onChange={(e) =>
                            handleUpdateColumn(index, { ...col, isUnique: e.target.checked })
                          }
                          className="rounded border-white/20 text-blue-500 focus:ring-0"
                        />
                        <span className="text-[11px] text-white/60">Unique</span>
                      </label>
                    </div>

                    {/* Foreign Key Reference */}
                    <div className="w-48">
                      <label className="block text-[10px] text-white/40 uppercase mb-0.5 flex items-center space-x-1">
                        <Link className="w-2.5 h-2.5 text-purple-400" />
                        <span>Foreign Key (Ref)</span>
                      </label>
                      <select
                        value={col.references ? `${col.references.table}.${col.references.column}` : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) {
                            handleUpdateColumn(index, { ...col, references: undefined });
                          } else {
                            const [refTable, refCol] = val.split('.');
                            handleUpdateColumn(index, {
                              ...col,
                              references: { table: refTable, column: refCol },
                            });
                          }
                        }}
                        className="w-full bg-[#181820] border border-white/[0.08] rounded px-2 py-1 text-white font-mono focus:outline-none focus:border-blue-500 text-[11px]"
                      >
                        <option value="">None (No FK)</option>
                        {project.tables
                          .filter((t) => t.id !== currentTable.id)
                          .flatMap((t) =>
                            t.columns.map((c) => (
                              <option key={`${t.name}.${c.name}`} value={`${t.name}.${c.name}`}>
                                {t.name}.{c.name}
                              </option>
                            ))
                          )}
                      </select>
                    </div>

                    {/* Delete column button */}
                    <button
                      onClick={() => handleDeleteColumn(index)}
                      className="p-1 hover:bg-red-500/20 text-white/30 hover:text-red-400 rounded transition mt-4"
                      title="Remove Column"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Mock Data Tab */
            <div className="flex-1 bg-[#1e1e26] border border-white/[0.08] rounded-xl flex flex-col min-h-0 overflow-hidden shadow-lg">
              <div className="h-10 bg-[#252530] border-b border-white/[0.08] px-4 flex items-center justify-between text-xs text-white/70 font-semibold shrink-0">
                <span>Sample Data Rows (Simulated Database Table)</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleGenerateSampleData}
                    disabled={isGeneratingMock}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/30 text-xs font-medium transition"
                  >
                    {isGeneratingMock ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-purple-300" />
                    )}
                    <span>AI Generate Mock Rows</span>
                  </button>
                  <button
                    onClick={handleAddRow}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Row</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-0">
                {currentTable.sampleData && currentTable.sampleData.length > 0 ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/[0.08] font-mono text-white/60">
                        <th className="py-2 px-3 w-10 text-center text-white/30">#</th>
                        {currentTable.columns.map((col) => (
                          <th key={col.name} className="py-2 px-3 font-semibold text-white/90">
                            {col.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04] font-mono">
                      {currentTable.sampleData.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-white/[0.04]">
                          <td className="py-1.5 px-3 text-center text-white/30 text-[11px]">
                            {rIdx + 1}
                          </td>
                          {currentTable.columns.map((col) => (
                            <td key={col.name} className="py-1.5 px-3 text-white/80">
                              <input
                                type="text"
                                value={row[col.name] !== undefined ? String(row[col.name]) : ''}
                                onChange={(e) => {
                                  const updatedData = [...(currentTable.sampleData || [])];
                                  updatedData[rIdx] = {
                                    ...updatedData[rIdx],
                                    [col.name]: e.target.value,
                                  };
                                  handleUpdateTable({
                                    ...currentTable,
                                    sampleData: updatedData,
                                  });
                                }}
                                className="w-full bg-transparent border-b border-transparent hover:border-white/20 focus:border-blue-500 focus:outline-none text-xs"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-12 text-center text-white/40 text-xs">
                    No sample data rows yet. Click "AI Generate Mock Rows" or "+ Add Row".
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-white/40 text-xs">
          No table selected. Click "+ Table" to create one.
        </div>
      )}
    </div>
  );
};
