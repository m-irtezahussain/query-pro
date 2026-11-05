import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  Download,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { Project } from '../types/schema';

interface RawDdlViewProps {
  project: Project;
}

export const RawDdlView: React.FC<RawDdlViewProps> = ({ project }) => {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'sql' | 'typescript' | 'json'>('sql');

  // Generate standard SQL DDL
  const generateSqlDdl = (): string => {
    const lines: string[] = [
      `-- Database Schema: ${project.name}`,
      `-- Target Dialect: ${project.dialect}`,
      `-- Generated on ${new Date().toLocaleDateString()}`,
      '',
    ];

    project.tables.forEach((table) => {
      lines.push(`-- Table: ${table.name}`);
      if (table.description) {
        lines.push(`-- Description: ${table.description}`);
      }
      lines.push(`CREATE TABLE IF NOT EXISTS ${table.name} (`);

      const colDefs = table.columns.map((c) => {
        let def = `  ${c.name} ${c.type}`;
        if (c.isPrimary) def += ' PRIMARY KEY';
        if (c.isNullable === false && !c.isPrimary) def += ' NOT NULL';
        if (c.isUnique && !c.isPrimary) def += ' UNIQUE';
        if (c.defaultValue) def += ` DEFAULT ${c.defaultValue}`;
        if (c.references) {
          def += ` REFERENCES ${c.references.table}(${c.references.column})`;
        }
        return def;
      });

      lines.push(colDefs.join(',\n'));
      lines.push(');\n');

      // Sample data INSERTs
      if (table.sampleData && table.sampleData.length > 0) {
        lines.push(`-- Sample data for ${table.name}`);
        table.sampleData.forEach((row) => {
          const cols = Object.keys(row);
          const vals = cols.map((col) => {
            const v = row[col];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
            return v;
          });
          lines.push(`INSERT INTO ${table.name} (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
        });
        lines.push('');
      }
    });

    return lines.join('\n');
  };

  // Generate TypeScript interfaces
  const generateTypeScript = (): string => {
    const lines: string[] = [
      `// TypeScript types for ${project.name}`,
      `// Dialect: ${project.dialect}`,
      '',
    ];

    project.tables.forEach((table) => {
      const typeName = table.name.charAt(0).toUpperCase() + table.name.slice(1);
      lines.push(`export interface ${typeName} {`);
      table.columns.forEach((c) => {
        let tsType = 'string';
        const u = c.type.toUpperCase();
        if (u.includes('INT') || u.includes('NUMERIC') || u.includes('FLOAT') || u.includes('DECIMAL')) {
          tsType = 'number';
        } else if (u.includes('BOOL')) {
          tsType = 'boolean';
        } else if (u.includes('JSON')) {
          tsType = 'Record<string, any>';
        } else if (u.includes('DATE') || u.includes('TIME')) {
          tsType = 'string | Date';
        }
        lines.push(`  ${c.name}${c.isNullable ? '?' : ''}: ${tsType};`);
      });
      lines.push('}\n');
    });

    return lines.join('\n');
  };

  const currentContent =
    format === 'sql'
      ? generateSqlDdl()
      : format === 'typescript'
      ? generateTypeScript()
      : JSON.stringify(project.tables, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extension = format === 'sql' ? 'sql' : format === 'typescript' ? 'ts' : 'json';
    const blob = new Blob([currentContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_schema.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#18181f] overflow-hidden">
      {/* Header */}
      <div className="h-10 bg-[#202028] border-b border-white/[0.08] px-4 flex items-center justify-between text-xs text-white/70 shrink-0">
        <div className="flex items-center space-x-2">
          <Code2 className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-white">Schema Export & Raw DDL</span>
          <span className="text-[10px] font-mono text-white/40">{project.dialect}</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center p-0.5 bg-black/40 rounded-lg border border-white/[0.08]">
            <button
              onClick={() => setFormat('sql')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                format === 'sql' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              SQL DDL
            </button>
            <button
              onClick={() => setFormat('typescript')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                format === 'typescript' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              TypeScript
            </button>
            <button
              onClick={() => setFormat('json')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                format === 'json' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              JSON
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 hover:text-white transition text-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Editor preview */}
      <div className="flex-1 overflow-auto p-4 md:p-6 bg-[#141418]">
        <div className="bg-[#1a1a22] border border-white/[0.08] rounded-xl p-4 font-mono text-xs text-white/90 shadow-xl overflow-x-auto">
          <pre>
            <code>{currentContent}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
