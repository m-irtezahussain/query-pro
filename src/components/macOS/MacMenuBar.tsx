import React, { useEffect, useState } from 'react';
import { Command, Database, Sparkles } from 'lucide-react';
import { SqlDialect } from '../../types/schema';

interface MacMenuBarProps {
  activeProjectName: string;
  dialect: SqlDialect;
  onOpenCommandPalette: () => void;
  onNewProject: () => void;
  onNewQuery: () => void;
  onSwitchView: (view: 'query' | 'schema' | 'er' | 'ddl') => void;
}

export const MacMenuBar: React.FC<MacMenuBarProps> = ({
  activeProjectName,
  dialect,
  onOpenCommandPalette,
  onNewQuery,
}) => {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => setTime(new Intl.DateTimeFormat(undefined, {
      hour: 'numeric', minute: '2-digit',
    }).format(new Date()));
    updateTime();
    const interval = window.setInterval(updateTime, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <header className="product-bar">
      <div className="product-brand" aria-label="QueryCraft home">
        <span className="product-mark"><Sparkles aria-hidden="true" /></span>
        <span>QueryCraft</span>
        <span className="product-badge">AI SQL workspace</span>
      </div>
      <div className="product-context" aria-label="Current workspace">
        <Database aria-hidden="true" />
        <span className="product-project-name">{activeProjectName}</span>
        <span className="product-context-divider" />
        <span>{dialect}</span>
      </div>
      <div className="product-actions">
        <button type="button" className="quiet-action" onClick={onNewQuery}>New query</button>
        <button type="button" className="command-trigger" onClick={onOpenCommandPalette} aria-label="Open command palette">
          <Command aria-hidden="true" /><span>Search</span><kbd>⌘K</kbd>
        </button>
        <span className="product-time" aria-label={`Current time ${time}`}>{time}</span>
      </div>
    </header>
  );
};
