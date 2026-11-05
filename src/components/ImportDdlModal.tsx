import React, { useState } from 'react';
import {
  X,
  FileUp,
  RefreshCw,
  Code2,
  Check,
  ArrowRight,
} from 'lucide-react';
import { Project, SqlDialect } from '../types/schema';
import { requestDdlParse } from '../services/api';

interface ImportDdlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSchema: (projectName: string, dialect: SqlDialect, tables: any[]) => void;
}

export const ImportDdlModal: React.FC<ImportDdlModalProps> = ({
  isOpen,
  onClose,
  onImportSchema,
}) => {
  const [projectName, setProjectName] = useState('');
  const [dialect, setDialect] = useState<SqlDialect>('PostgreSQL');
  const [ddl, setDdl] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const dialects: SqlDialect[] = ['PostgreSQL', 'MySQL', 'SQLite', 'SQL Server', 'BigQuery'];

  const sampleDdl = `CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  content TEXT,
  view_count INT DEFAULT 0
);`;

  const handleParse = async () => {
    if (!ddl.trim()) {
      setError('Please paste your SQL CREATE TABLE statements.');
      return;
    }

    setIsParsing(true);
    setError(null);

    try {
      const res = await requestDdlParse(ddl, dialect);
      if (!res.tables || res.tables.length === 0) {
        throw new Error('No tables could be parsed from the provided DDL.');
      }

      onImportSchema(
        projectName.trim() || 'Imported Schema Project',
        dialect,
        res.tables
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to parse DDL script.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#202029] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-12 bg-[#252533] border-b border-white/[0.08] px-5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileUp className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Import SQL DDL Statements</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-md text-white/50 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/60 font-medium mb-1">Project Name</label>
              <input
                type="text"
                placeholder="e.g. Production Database DDL"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
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

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-white/70 font-medium">Paste SQL CREATE TABLE script:</label>
              <button
                onClick={() => setDdl(sampleDdl)}
                className="text-[11px] text-blue-400 hover:text-blue-300"
              >
                Load Sample DDL
              </button>
            </div>
            <textarea
              rows={8}
              value={ddl}
              onChange={(e) => setDdl(e.target.value)}
              placeholder="CREATE TABLE customers ( id INT PRIMARY KEY, name VARCHAR(100) ... );"
              className="w-full bg-black/30 border border-white/[0.1] rounded-lg p-3 text-white placeholder-white/30 font-mono text-xs focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 bg-[#1b1b24] border-t border-white/[0.08] px-5 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-white text-xs transition"
          >
            Cancel
          </button>

          <button
            onClick={handleParse}
            disabled={isParsing || !ddl.trim()}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs shadow-lg shadow-blue-600/30 transition active:scale-95"
          >
            {isParsing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Parsing & Generating Mock Rows…</span>
              </>
            ) : (
              <>
                <span>Parse & Import Schema</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
