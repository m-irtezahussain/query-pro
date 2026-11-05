import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Database,
  Layers,
  ArrowRight,
  FolderPlus,
  RefreshCw,
} from 'lucide-react';
import { Project, SqlDialect, TableDefinition } from '../types/schema';
import { requestSchemaGeneration } from '../services/api';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: Project) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dialect, setDialect] = useState<SqlDialect>('PostgreSQL');
  const [mode, setMode] = useState<'ai' | 'blank' | 'template'>('ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const dialects: SqlDialect[] = ['PostgreSQL', 'MySQL', 'SQLite', 'SQL Server', 'BigQuery'];

  const templates = [
    {
      title: 'Hospital & Healthcare EMR',
      prompt: 'Hospital patient electronic medical records, appointments, doctors, prescriptions, and billing invoices',
      dialect: 'PostgreSQL' as SqlDialect,
    },
    {
      title: 'Fintech & Crypto Portfolio',
      prompt: 'Crypto and fiat wallets, user verification tiers, currency exchange transactions, and ledger audit logs',
      dialect: 'PostgreSQL' as SqlDialect,
    },
    {
      title: 'Social Network & Feeds',
      prompt: 'Users, user follows, feed posts, comments, likes, and notification events',
      dialect: 'MySQL' as SqlDialect,
    },
  ];

  const handleCreate = async () => {
    setError(null);

    if (mode === 'blank') {
      const projName = name.trim() || 'Untitled Project';
      const newProj: Project = {
        id: `proj-${Date.now()}`,
        name: projName,
        description: description.trim() || 'Database schema project',
        dialect,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tables: [
          {
            id: `tbl-${Date.now()}`,
            name: 'items',
            description: 'Default starter table',
            columns: [
              { name: 'id', type: 'INTEGER', isPrimary: true, isNullable: false },
              { name: 'name', type: 'VARCHAR(255)', isNullable: false },
              { name: 'created_at', type: 'TIMESTAMP', defaultValue: 'NOW()' },
            ],
            sampleData: [
              { id: 1, name: 'Sample Item Alpha', created_at: new Date().toISOString() },
              { id: 2, name: 'Sample Item Beta', created_at: new Date().toISOString() },
            ],
          },
        ],
        savedQueries: [],
        history: [],
      };
      onCreateProject(newProj);
      onClose();
      return;
    }

    // AI Generated Mode
    const promptToUse = mode === 'template' ? aiPrompt : aiPrompt.trim();
    if (!promptToUse) {
      setError('Please provide an English description of the application database.');
      return;
    }

    setIsGenerating(true);

    try {
      const res = await requestSchemaGeneration(promptToUse, dialect);

      const newProj: Project = {
        id: `proj-${Date.now()}`,
        name: name.trim() || res.projectName || 'AI Generated Project',
        description: description.trim() || res.projectDescription || promptToUse,
        dialect,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tables: res.tables,
        savedQueries: [],
        history: [],
      };

      onCreateProject(newProj);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to generate schema with AI');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#202029] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="h-12 bg-[#252533] border-b border-white/[0.08] px-5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FolderPlus className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Create New Database Project</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-md text-white/50 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Creation Mode Tabs */}
          <div className="flex items-center p-1 bg-black/30 rounded-lg border border-white/[0.08]">
            <button
              onClick={() => setMode('ai')}
              className={`flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center space-x-1.5 ${
                mode === 'ai' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Generate with AI</span>
            </button>
            <button
              onClick={() => setMode('template')}
              className={`flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center space-x-1.5 ${
                mode === 'template' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Templates</span>
            </button>
            <button
              onClick={() => setMode('blank')}
              className={`flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center space-x-1.5 ${
                mode === 'blank' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-blue-300" />
              <span>Blank Schema</span>
            </button>
          </div>

          {/* Basic Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/60 font-medium mb-1">Project Name</label>
              <input
                type="text"
                placeholder="e.g. Flight Booking System"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black/30 border border-white/[0.1] rounded-lg px-3 py-1.5 text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-white/60 font-medium mb-1">SQL Dialect</label>
              <select
                value={dialect}
                onChange={(e) => setDialect(e.target.value as SqlDialect)}
                className="w-full bg-[#181822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
              >
                {dialects.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* AI Generation Prompt */}
          {mode === 'ai' && (
            <div className="space-y-1.5">
              <label className="block text-white/70 font-medium flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Describe your application in English:</span>
              </label>
              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Car rental platform with customer profiles, vehicles, rental bookings, insurance options, and maintenance logs..."
                className="w-full bg-black/30 border border-white/[0.1] rounded-lg p-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 resize-none font-sans"
              />
              <p className="text-[11px] text-white/40">
                Cloudflare Workers AI will automatically design normalized tables, relationships, column types, and sample data.
              </p>
            </div>
          )}

          {/* Templates Selector */}
          {mode === 'template' && (
            <div className="space-y-2">
              <label className="block text-white/60 font-medium">Select a Domain Template:</label>
              <div className="space-y-2">
                {templates.map((tpl, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setName(tpl.title);
                      setAiPrompt(tpl.prompt);
                      setDialect(tpl.dialect);
                    }}
                    className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                      aiPrompt === tpl.prompt
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-black/20 border-white/[0.06] text-white/70 hover:bg-black/40 hover:text-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-white">{tpl.title}</div>
                      <div className="text-[11px] text-white/50">{tpl.prompt}</div>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50">
                      {tpl.dialect}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-14 bg-[#1b1b24] border-t border-white/[0.08] px-5 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-white text-xs transition"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={isGenerating}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs shadow-lg shadow-blue-600/30 transition active:scale-95"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Designing Database Schema…</span>
              </>
            ) : (
              <>
                <span>Create Project</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
