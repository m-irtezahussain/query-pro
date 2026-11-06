import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Play,
  Copy,
  Check,
  Star,
  RefreshCw,
  Lightbulb,
  Table2,
  Clock,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Download,
  Terminal,
  FileCode,
  Zap,
} from 'lucide-react';
import { GeneratedQuery, Project, QueryExecutionResult } from '../types/schema';
import {
  requestLiveQueryExecution,
  requestSqlGeneration,
  requestSqlExplanation,
} from '../services/api';
import { executeProjectSql } from '../services/sqlRunner';

interface NaturalLanguageQueryViewProps {
  project: Project;
  activeQuery: GeneratedQuery | null;
  onSaveQuery: (query: GeneratedQuery) => void;
  onUpdateHistory: (query: GeneratedQuery) => void;
  onConnectDatabase: () => void;
}

export const NaturalLanguageQueryView: React.FC<NaturalLanguageQueryViewProps> = ({
  project,
  activeQuery,
  onSaveQuery,
  onUpdateHistory,
  onConnectDatabase,
}) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentQuery, setCurrentQuery] = useState<GeneratedQuery | null>(activeQuery);
  const [executionResult, setExecutionResult] = useState<QueryExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [customContext, setCustomContext] = useState(project.contextNotes || '');
  const [resultFilter, setResultFilter] = useState('');
  const liveConnectionExpired = Boolean(
    project.liveConnection && project.liveConnection.expiresAt <= Date.now()
  );

  const executeQuery = React.useCallback(
    async (sql: string) => {
      if (project.liveConnection) {
        if (project.liveConnection.expiresAt <= Date.now()) {
          throw new Error('The live database session has expired. Reconnect the database.');
        }
        return requestLiveQueryExecution(project.liveConnection.id, sql);
      }
      return executeProjectSql(sql, project.tables);
    },
    [project.liveConnection, project.tables]
  );

  // Sync when activeQuery changes from sidebar
  useEffect(() => {
    if (activeQuery) {
      setCurrentQuery(activeQuery);
      setPrompt(activeQuery.prompt);
      if (activeQuery.executionResult) {
        setExecutionResult(activeQuery.executionResult);
      } else {
        executeQuery(activeQuery.sql)
          .then(setExecutionResult)
          .catch((executionError) =>
            setExecutionResult({ success: false, error: executionError.message })
          );
      }
    }
  }, [activeQuery, executeQuery]);

  // Suggested prompt chips based on active project schema
  const samplePrompts = React.useMemo(() => {
    if (project.tables.length === 0) {
      return ['Add tables to your project first to ask questions!'];
    }
    const tableNames = project.tables.map((t) => t.name);

    if (tableNames.includes('subscriptions') && tableNames.includes('plans')) {
      return [
        'Show total monthly revenue and active subscriber count by plan',
        'Which users currently have past_due subscriptions?',
        'Find top 3 users by daily API requests recorded',
        'List all canceled or expiring subscriptions with customer emails',
      ];
    }

    if (tableNames.includes('orders') && tableNames.includes('customers')) {
      return [
        'Find top 5 customers by total order spend',
        'Show average order amount per customer city',
        'List products with stock quantity below 20 items',
        'Count orders grouped by delivery status',
      ];
    }

    // Generic schema suggestions
    const primaryTable = project.tables[0];
    return [
      `Show the first 10 records from ${primaryTable.name} ordered by date or id`,
      `Count total number of rows in ${primaryTable.name}`,
      `Find records in ${primaryTable.name} with specific attributes`,
    ];
  }, [project.tables]);

  const handleGenerate = async (queryText?: string) => {
    const textToUse = (queryText || prompt).trim();
    if (!textToUse) return;

    if (project.tables.length === 0) {
      setError('Please add at least one table to the schema before generating queries.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await requestSqlGeneration(
        textToUse,
        project.tables,
        project.dialect,
        customContext
      );

      let runRes: QueryExecutionResult;
      try {
        runRes = await executeQuery(result.sql);
      } catch (executionError: any) {
        runRes = { success: false, error: executionError.message || 'Query execution failed.' };
      }

      const newQuery: GeneratedQuery = {
        id: `q-${Date.now()}`,
        prompt: textToUse,
        sql: result.sql,
        explanation: result.explanation,
        dialect: project.dialect,
        tablesUsed: result.tablesUsed,
        columnsUsed: result.columnsUsed,
        assumptions: result.assumptions,
        caveats: result.caveats,
        suggestedIndexes: result.suggestedIndexes,
        followUpQuestions: result.followUpQuestions,
        createdAt: Date.now(),
        executionResult: project.liveConnection ? undefined : runRes,
      };

      setCurrentQuery(newQuery);
      setExecutionResult(runRes);
      onUpdateHistory(newQuery);
    } catch (err: any) {
      setError(err.message || 'Failed to generate SQL query');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunQuery = async () => {
    if (!currentQuery) return;
    setIsExecuting(true);
    try {
      const res = await executeQuery(currentQuery.sql);
      setExecutionResult(res);
    } catch (executionError: any) {
      setExecutionResult({ success: false, error: executionError.message });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopySql = () => {
    if (!currentQuery) return;
    navigator.clipboard.writeText(currentQuery.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleFavorite = () => {
    if (!currentQuery) return;
    const updated = { ...currentQuery, isFavorite: !currentQuery.isFavorite };
    setCurrentQuery(updated);
    onSaveQuery(updated);
  };

  const exportResultsCsv = () => {
    if (!executionResult || !executionResult.rows || executionResult.rows.length === 0) return;
    const headers = executionResult.columns || Object.keys(executionResult.rows[0]);
    const csvRows = [
      headers.join(','),
      ...executionResult.rows.map((row) =>
        headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered rows
  const displayedRows = React.useMemo(() => {
    if (!executionResult?.rows) return [];
    if (!resultFilter.trim()) return executionResult.rows;
    const query = resultFilter.toLowerCase();
    return executionResult.rows.filter((row) =>
      Object.values(row).some((val) => String(val).toLowerCase().includes(query))
    );
  }, [executionResult?.rows, resultFilter]);

  return (
    <div className="query-workspace">
      {/* Scrollable Content Container */}
      <div className="query-scroll">
        {!project.liveConnection && (
          <div className="mode-banner rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-200">Schema-only mode</p>
              <p className="text-xs text-amber-100/70 mt-0.5">
                This saved project is not connected to the live database. Queries run only against saved sample data, so production rows will not appear.
              </p>
            </div>
            <button
              type="button"
              onClick={onConnectDatabase}
              className="shrink-0 rounded-lg bg-amber-300/20 border border-amber-300/30 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-300/30"
            >
              Connect database
            </button>
          </div>
        )}

        {liveConnectionExpired && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-red-200">Live database session expired</p>
              <p className="text-xs text-red-100/70 mt-0.5">
                Reconnect to create a new temporary read-only database user.
              </p>
            </div>
            <button
              type="button"
              onClick={onConnectDatabase}
              className="shrink-0 rounded-lg bg-red-300/20 border border-red-300/30 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-300/30"
            >
              Reconnect
            </button>
          </div>
        )}

        {/* Header & Prompt Card */}
        <div className="prompt-card bg-[#202029] border border-white/[0.08] rounded-xl p-4 md:p-5 shadow-lg relative">
          <div className="prompt-card-header flex items-center justify-between mb-2.5">
            <div className="prompt-card-title flex items-center space-x-2">
              <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-white tracking-tight flex items-center space-x-2">
                  <span>Natural Language Query Generator</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-white/60">
                    Dialect: {project.dialect}
                  </span>
                </h2>
                <p className="text-xs text-white/50">
                  Ask in plain English. Powered by Cloudflare Workers AI against your{' '}
                  <span className="text-white/80 font-medium">{project.tables.length} tables</span>.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowContext(!showContext)}
              className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded hover:bg-white/[0.05] transition flex items-center space-x-1"
            >
              <span>Context rules</span>
              {showContext ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {showContext && (
            <div className="mb-3 p-2.5 rounded-lg bg-black/30 border border-white/[0.06] text-xs">
              <label className="block text-white/60 font-medium mb-1">
                Project Business Rules & Context (optional):
              </label>
              <input
                type="text"
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="e.g. Inactive users have status = 'archived'. Revenue is calculated in USD."
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded px-2.5 py-1 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          )}

          {/* Prompt Input Box */}
          <div className="relative">
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="e.g. Find all customers who have made more than 2 orders, with their total spend and latest order date…"
              className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition resize-none font-sans"
            />

            <div className="prompt-actions flex items-center justify-between mt-2.5">
              <span className="text-[11px] text-white/40 flex items-center space-x-1">
                <span>Press</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1] font-mono text-[10px] text-white/70">
                  ⌘
                </kbd>
                <span>+</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1] font-mono text-[10px] text-white/70">
                  Enter
                </kbd>
                <span>to generate</span>
              </span>

              <button
                onClick={() => handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition active:scale-95"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Synthesizing SQL…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Generate SQL Query</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Suggestion Chips */}
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center space-x-2 flex-wrap gap-y-1.5">
            <span className="text-[11px] text-white/40 font-medium flex items-center space-x-1 shrink-0">
              <Lightbulb className="w-3 h-3 text-amber-400" />
              <span>Try asking:</span>
            </span>
            {samplePrompts.slice(0, 3).map((sp, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setPrompt(sp);
                  handleGenerate(sp);
                }}
                className="text-[11px] text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.06] px-2.5 py-1 rounded-full transition truncate max-w-[260px] md:max-w-xs"
              >
                "{sp}"
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Query & Execution Results Workspace */}
        {currentQuery && (
          <div className="space-y-4">
            {/* Generated SQL Editor Card */}
            <div className="bg-[#1f2027] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
              {/* Card Header */}
              <div className="h-10 bg-[#252530] border-b border-white/[0.08] px-4 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-white">Generated SQL Query</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {currentQuery.dialect}
                  </span>
                  {currentQuery.tablesUsed && currentQuery.tablesUsed.length > 0 && (
                    <div className="hidden sm:flex items-center space-x-1 text-[11px] text-white/50">
                      <span>Tables:</span>
                      {currentQuery.tablesUsed.map((tbl) => (
                        <span key={tbl} className="text-white/80 font-mono">
                          {tbl}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={handleToggleFavorite}
                    className={`p-1.5 rounded-md hover:bg-white/[0.08] transition ${
                      currentQuery.isFavorite ? 'text-amber-400' : 'text-white/50 hover:text-white'
                    }`}
                    title={currentQuery.isFavorite ? 'Remove from Favorites' : 'Save to Favorites'}
                  >
                    <Star className={`w-3.5 h-3.5 ${currentQuery.isFavorite ? 'fill-amber-400' : ''}`} />
                  </button>

                  <button
                    onClick={handleCopySql}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-white/80 hover:text-white transition text-xs"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={handleRunQuery}
                    disabled={isExecuting}
                    className="flex items-center space-x-1 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition text-xs shadow-md shadow-emerald-900/40"
                    title="Run Query against In-Memory Database (⌘↵)"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Query</span>
                  </button>
                </div>
              </div>

              {/* Code Box with Syntax Highlighting Look */}
              <div className="p-4 bg-[#141418] font-mono text-xs overflow-x-auto text-[#e0e6ed] leading-relaxed border-b border-white/[0.06]">
                <pre className="selection:bg-blue-600/40">
                  <code>{currentQuery.sql}</code>
                </pre>
              </div>

              {/* Explanation & Breakdown Accordion */}
              <div className="p-4 bg-[#1c1c23] border-t border-white/[0.06] text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-white/90 flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span>Query Breakdown & Logic</span>
                  </span>
                  <button
                    onClick={() => setShowExplanation(!showExplanation)}
                    className="text-[11px] text-white/50 hover:text-white flex items-center space-x-1"
                  >
                    <span>{showExplanation ? 'Collapse' : 'Expand'}</span>
                    {showExplanation ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {showExplanation && (
                  <div className="space-y-3 pt-1">
                    <p className="text-white/80 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-white/[0.04]">
                      {currentQuery.explanation}
                    </p>

                    {/* Columns & Assumptions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {currentQuery.assumptions && currentQuery.assumptions.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-black/20 border border-white/[0.04]">
                          <span className="text-[11px] font-semibold text-white/60 block mb-1">
                            Assumptions Made:
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-white/70 text-[11px]">
                            {currentQuery.assumptions.map((assump, idx) => (
                              <li key={idx}>{assump}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {currentQuery.suggestedIndexes && currentQuery.suggestedIndexes.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-black/20 border border-white/[0.04]">
                          <span className="text-[11px] font-semibold text-emerald-400/80 block mb-1">
                            Recommended Performance Indexes:
                          </span>
                          <div className="space-y-1">
                            {currentQuery.suggestedIndexes.map((idxSql, idx) => (
                              <code
                                key={idx}
                                className="block font-mono text-[10px] text-emerald-300 bg-emerald-950/40 p-1 rounded border border-emerald-800/30 truncate"
                              >
                                {idxSql}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {currentQuery.caveats && (
                      <div className="text-[11px] text-amber-300/90 bg-amber-950/20 border border-amber-500/20 p-2 rounded-lg">
                        <span className="font-semibold">Caveat / Note: </span>
                        {currentQuery.caveats}
                      </div>
                    )}

                    {/* Follow-up Question Chips */}
                    {currentQuery.followUpQuestions && currentQuery.followUpQuestions.length > 0 && (
                      <div className="pt-2 border-t border-white/[0.06]">
                        <span className="text-[11px] text-white/50 block mb-1.5 font-medium">
                          Suggested Follow-up Questions:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {currentQuery.followUpQuestions.map((fq, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setPrompt(fq);
                                handleGenerate(fq);
                              }}
                              className="text-[11px] text-blue-300 hover:text-white bg-blue-500/10 hover:bg-blue-600/30 border border-blue-500/20 px-2.5 py-1 rounded-md transition text-left flex items-center space-x-1"
                            >
                              <span>{fq}</span>
                              <ArrowRight className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* In-Memory Database Execution Results Card */}
            <div className="bg-[#1f2027] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
              {/* Results Header */}
              <div className="h-10 bg-[#252530] border-b border-white/[0.08] px-4 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Table2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-white">Database Execution Result</span>
                  {executionResult?.success && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{executionResult.executionTimeMs}ms</span>
                    </span>
                  )}
                  {executionResult?.rowCount !== undefined && (
                    <span className="text-[10px] text-white/50 font-mono">
                      {displayedRows.length} row{displayedRows.length === 1 ? '' : 's'} returned
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {executionResult?.rows && executionResult.rows.length > 0 && (
                    <>
                      <input
                        type="text"
                        placeholder="Filter rows…"
                        value={resultFilter}
                        onChange={(e) => setResultFilter(e.target.value)}
                        className="bg-black/30 border border-white/[0.08] rounded px-2 py-0.5 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={exportResultsCsv}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 hover:text-white transition text-xs"
                        title="Download CSV"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export CSV</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Result Table Content */}
              <div className="p-0 overflow-x-auto max-h-96">
                {executionResult ? (
                  executionResult.success ? (
                    displayedRows.length > 0 ? (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-white/[0.03] border-b border-white/[0.08] text-white/60 font-mono">
                            <th className="py-2 px-3 w-10 text-center text-white/30">#</th>
                            {executionResult.columns?.map((col) => (
                              <th key={col} className="py-2 px-3 font-semibold text-white/90">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04] font-mono">
                          {displayedRows.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-white/[0.04] transition">
                              <td className="py-1.5 px-3 text-center text-white/30 text-[11px]">
                                {rowIdx + 1}
                              </td>
                              {executionResult.columns?.map((col) => {
                                const val = row[col];
                                const isNull = val === null || val === undefined;
                                return (
                                  <td
                                    key={col}
                                    className={`py-1.5 px-3 text-xs truncate max-w-xs ${
                                      isNull ? 'text-white/20 italic' : 'text-white/90'
                                    }`}
                                  >
                                    {isNull ? 'NULL' : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-8 text-center text-white/40 text-xs">
                        Query executed successfully in {executionResult.executionTimeMs}ms, but returned 0 rows matching criteria.
                      </div>
                    )
                  ) : (
                    <div className="p-5 text-xs text-red-300 bg-red-950/20 border-l-4 border-red-500">
                      <div className="font-semibold mb-1 flex items-center space-x-1">
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                        <span>Database Execution Notice</span>
                      </div>
                      <p className="font-mono text-[11px] text-white/70 mb-2">
                        {executionResult.error}
                      </p>
                      <p className="text-white/50 text-[11px]">
                        The generated query uses specific dialect features for {project.dialect}. You can copy the SQL directly to run in your production database or adjust constraints.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="p-8 text-center text-white/40 text-xs">
                    Click "Run Query" to execute on the project's in-memory SQLite database.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
