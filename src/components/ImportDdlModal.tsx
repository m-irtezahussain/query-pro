import React, { useEffect, useState } from 'react';
import { ArrowRight, Code2, Database, FileUp, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Project, SqlDialect, TableDefinition } from '../types/schema';
import {
  DatabaseConnectionRequest,
  requestDatabaseIntrospection,
  requestDdlParse,
} from '../services/api';

interface ImportDdlModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionOnly?: boolean;
  isReconnect?: boolean;
  initialProjectName?: string;
  initialConnection?: Partial<DatabaseConnectionRequest>;
  onImportSchema: (
    projectName: string,
    dialect: SqlDialect,
    tables: TableDefinition[],
    liveConnection?: Project['liveConnection']
  ) => void;
}

const MAX_SCHEMA_FILE_BYTES = 1024 * 1024;
const DEFAULT_CONNECTION: DatabaseConnectionRequest = {
  engine: 'PostgreSQL',
  host: '',
  port: 5432,
  database: '',
  schema: 'public',
  user: '',
  password: '',
  tlsMode: 'require',
};

export const ImportDdlModal: React.FC<ImportDdlModalProps> = ({
  isOpen,
  onClose,
  connectionOnly = false,
  isReconnect = false,
  initialProjectName = '',
  initialConnection,
  onImportSchema,
}) => {
  const [mode, setMode] = useState<'file' | 'connection'>('file');
  const [projectName, setProjectName] = useState('');
  const [dialect, setDialect] = useState<SqlDialect>('PostgreSQL');
  const [ddl, setDdl] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<DatabaseConnectionRequest>(DEFAULT_CONNECTION);

  useEffect(() => {
    if (!isOpen) return;
    setMode(connectionOnly ? 'connection' : 'file');
    setProjectName(initialProjectName);
    setError(null);
    setConnection({
      ...DEFAULT_CONNECTION,
      ...initialConnection,
      password: '',
    });
  }, [isOpen, connectionOnly, initialProjectName, initialConnection]);

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

  const completeImport = (
    tables: TableDefinition[],
    importedDialect: SqlDialect,
    liveConnection?: Project['liveConnection']
  ) => {
    onImportSchema(
      projectName.trim() || `Imported ${importedDialect} Schema`,
      importedDialect,
      tables,
      liveConnection
    );
    setConnection((current) => ({ ...current, password: '' }));
    onClose();
  };

  const handleSchemaFile = async (file?: File) => {
    if (!file) return;
    setError(null);

    if (file.size <= 0 || file.size > MAX_SCHEMA_FILE_BYTES) {
      setError('Schema files must be between 1 byte and 1 MB.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'sql' && extension !== 'json') {
      setError('Only .sql and .json schema files are supported.');
      return;
    }

    try {
      const content = await file.text();
      if (extension === 'sql') {
        setDdl(content);
        if (!projectName.trim()) setProjectName(file.name.replace(/\.sql$/i, ''));
        return;
      }

      const parsed = JSON.parse(content);
      const tables = (Array.isArray(parsed) ? parsed : parsed?.tables) as TableDefinition[];
      if (
        !Array.isArray(tables) ||
        tables.length === 0 ||
        tables.some(
          (table) =>
            !table ||
            typeof table.name !== 'string' ||
            !Array.isArray(table.columns) ||
            table.columns.some(
              (column) =>
                !column || typeof column.name !== 'string' || typeof column.type !== 'string'
            )
        )
      ) {
        throw new Error('JSON must contain a non-empty tables array with named columns and types.');
      }

      completeImport(
        tables.map((table, tableIndex) => ({
          ...table,
          id: table.id || `tbl-import-${tableIndex + 1}`,
          sampleData: Array.isArray(table.sampleData) ? table.sampleData : [],
        })),
        dialect
      );
    } catch (fileError: any) {
      setError(fileError.message || 'The selected schema file could not be read.');
    }
  };

  const handleParseDdl = async () => {
    if (!ddl.trim()) {
      setError('Upload or paste SQL CREATE TABLE statements first.');
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const result = await requestDdlParse(ddl, dialect);
      if (!result.tables?.length) throw new Error('No tables could be parsed from this DDL.');
      completeImport(result.tables, dialect);
    } catch (requestError: any) {
      setError(requestError.message || 'Failed to parse the DDL schema.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleConnect = async () => {
    if (
      !connection.host.trim() ||
      !connection.database.trim() ||
      !connection.user.trim() ||
      !connection.password
    ) {
      setError('Host, database, user, and password are required.');
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const result = await requestDatabaseIntrospection(connection);
      completeImport(result.tables, connection.engine, {
        id: result.connectionId,
        engine: connection.engine,
        expiresAt: result.connectionExpiresAt,
        profile: {
          host: connection.host.trim(),
          port: connection.port,
          database: connection.database.trim(),
          schema: connection.schema?.trim() || undefined,
          user: connection.user.trim(),
          tlsMode: connection.tlsMode,
        },
      });
    } catch (requestError: any) {
      setError(requestError.message || 'Failed to inspect the database schema.');
    } finally {
      setIsWorking(false);
    }
  };

  const updateConnection = <K extends keyof DatabaseConnectionRequest>(
    field: K,
    value: DatabaseConnectionRequest[K]
  ) => setConnection((current) => ({ ...current, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#202029] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="h-12 bg-[#252533] border-b border-white/[0.08] px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">
              {connectionOnly
                ? isReconnect ? 'Reconnect Database' : 'Connect Database'
                : 'Import Database Schema'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-md text-white/50 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          {!connectionOnly && <div className="flex items-center p-1 bg-black/30 rounded-lg border border-white/[0.08]">
            <button
              onClick={() => { setMode('file'); setError(null); }}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-1.5 ${mode === 'file' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'}`}
            >
              <FileUp className="w-3.5 h-3.5" /> Upload or paste schema
            </button>
            <button
              onClick={() => { setMode('connection'); setError(null); }}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-1.5 ${mode === 'connection' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'}`}
            >
              <Database className="w-3.5 h-3.5" /> Connect to database
            </button>
          </div>}

          {isReconnect && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-blue-100/80">
              Re-enter the provisioning password to create a fresh eight-hour read-only session. QueryCraft does not save database passwords in the browser.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-white/60 font-medium">Project Name</span>
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Production Database"
                maxLength={100}
                className="w-full bg-black/30 border border-white/[0.1] rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
              />
            </label>

            {mode === 'file' && (
              <label className="space-y-1">
                <span className="text-white/60 font-medium">SQL Dialect</span>
                <select
                  value={dialect}
                  onChange={(event) => setDialect(event.target.value as SqlDialect)}
                  className="w-full bg-[#181822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white"
                >
                  {dialects.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            )}
          </div>

          {mode === 'file' ? (
            <>
              <label className="block border border-dashed border-white/[0.15] hover:border-blue-500/50 rounded-xl p-4 text-center cursor-pointer bg-black/20">
                <FileUp className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <span className="text-white/80 font-medium">Choose a .sql or .json schema file</span>
                <span className="block text-white/40 mt-0.5">Maximum 1 MB; the file is not stored on the server</span>
                <input
                  type="file"
                  accept=".sql,.json,application/json,text/plain,application/sql"
                  className="hidden"
                  onChange={(event) => handleSchemaFile(event.target.files?.[0])}
                />
              </label>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-white/70 font-medium flex items-center gap-1"><Code2 className="w-3.5 h-3.5" /> SQL DDL</label>
                  <button onClick={() => setDdl(sampleDdl)} className="text-blue-400 hover:text-blue-300">Load sample DDL</button>
                </div>
                <textarea
                  rows={9}
                  value={ddl}
                  maxLength={MAX_SCHEMA_FILE_BYTES}
                  onChange={(event) => setDdl(event.target.value)}
                  placeholder="CREATE TABLE customers (...);"
                  className="w-full bg-black/30 border border-white/[0.1] rounded-lg p-3 text-white font-mono focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-white/60">Engine</span>
                  <select
                    value={connection.engine}
                    onChange={(event) => {
                      const engine = event.target.value as 'PostgreSQL' | 'MySQL';
                      setConnection((current) => ({
                        ...current,
                        engine,
                        port: engine === 'PostgreSQL' ? 5432 : 3306,
                        schema: engine === 'PostgreSQL' ? 'public' : undefined,
                      }));
                    }}
                    className="w-full bg-[#181822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white"
                  >
                    <option>PostgreSQL</option>
                    <option>MySQL</option>
                  </select>
                </label>
                <label className="space-y-1 col-span-2">
                  <span className="text-white/60">Host</span>
                  <input value={connection.host} onChange={(e) => updateConnection('host', e.target.value)} placeholder="db.example.com" className="w-full bg-black/30 border border-white/[0.1] rounded-lg px-3 py-1.5 text-white" />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-white/60">Port</span>
                  <input type="number" min={1} max={65535} value={connection.port || ''} onChange={(e) => updateConnection('port', Number(e.target.value))} className="w-full bg-black/30 border border-white/[0.1] rounded-lg px-3 py-1.5 text-white" />
                </label>
                <label className="space-y-1">
                  <span className="text-white/60">Database</span>
                  <input value={connection.database} onChange={(e) => updateConnection('database', e.target.value)} placeholder="app_database" className="w-full bg-black/30 border border-white/[0.1] rounded-lg px-3 py-1.5 text-white" />
                </label>
                {connection.engine === 'PostgreSQL' && (
                  <label className="space-y-1">
                    <span className="text-white/60">Schema</span>
                    <input value={connection.schema || ''} onChange={(e) => updateConnection('schema', e.target.value)} placeholder="public" className="w-full bg-black/30 border border-white/[0.1] rounded-lg px-3 py-1.5 text-white" />
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-white/60">Provisioning user</span>
                  <input autoComplete="username" value={connection.user} onChange={(e) => updateConnection('user', e.target.value)} placeholder="e.g. doadmin" className="w-full bg-black/30 border border-white/[0.1] rounded-lg px-3 py-1.5 text-white" />
                </label>
                <label className="space-y-1">
                  <span className="text-white/60">Password</span>
                  <input type="password" autoComplete="current-password" value={connection.password} onChange={(e) => updateConnection('password', e.target.value)} className="w-full bg-black/30 border border-white/[0.1] rounded-lg px-3 py-1.5 text-white" />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-white/60">TLS mode</span>
                <select
                  value={connection.tlsMode}
                  onChange={(event) =>
                    updateConnection(
                      'tlsMode',
                      event.target.value as DatabaseConnectionRequest['tlsMode']
                    )
                  }
                  className="w-full bg-[#181822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white"
                >
                  <option value="require">Require encryption — managed DB compatible</option>
                  <option value="verify-full">Verify with system CA — strict verification</option>
                  <option value="disable">Disable TLS — local development only</option>
                </select>
                <span className="block text-[11px] text-white/40">
                  Require encryption works with Neon, DigitalOcean, and similar providers without a CA upload. Strict verification can reject provider-specific certificate chains.
                </span>
              </label>

              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-emerald-200/80 flex gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>The supplied account is used to create a temporary read-only database user, so it must be allowed to create users/roles and grant access. For DigitalOcean PostgreSQL, use the cluster's doadmin account. QueryCraft then uses only the restricted temporary user for schema discovery and live queries. Both passwords stay in backend memory and are never added to the saved project.</span>
              </div>
            </div>
          )}

          {error && <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300">{error}</div>}
        </div>

        <div className="h-14 bg-[#1b1b24] border-t border-white/[0.08] px-5 flex items-center justify-between shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg hover:bg-white/[0.06] text-white/60">Cancel</button>
          <button
            onClick={mode === 'file' ? handleParseDdl : handleConnect}
            disabled={isWorking || (mode === 'file' ? !ddl.trim() : !connection.host.trim())}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium shadow-lg shadow-blue-600/30"
          >
            {isWorking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            <span>
              {isWorking
                ? isReconnect ? 'Reconnecting…' : 'Importing schema…'
                : mode === 'file'
                  ? 'Parse & Save Schema'
                  : isReconnect ? 'Reconnect & Refresh Schema' : 'Connect & Save Schema'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
