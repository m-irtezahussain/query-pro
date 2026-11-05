import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Search, Terminal, Database, Sparkles, HelpCircle } from 'lucide-react';
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
  onNewProject,
  onNewQuery,
  onSwitchView,
}) => {
  const [time, setTime] = useState<string>('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-7 w-full bg-[#16161a]/90 backdrop-blur-xl border-b border-white/[0.06] text-white/90 text-[12px] font-medium flex items-center justify-between px-3 select-none z-50 shrink-0">
      {/* Left Menu Items */}
      <div className="flex items-center space-x-3.5">
        <span className="font-bold text-[14px] leading-none text-white/90 hover:opacity-80 transition cursor-default">
          
        </span>
        <span className="font-semibold text-white tracking-tight cursor-default flex items-center space-x-1">
          <span>QueryCraft</span>
          <span className="text-[9px] px-1.5 py-0.2 bg-blue-500/20 text-blue-400 rounded-sm font-mono border border-blue-500/30">
            macOS
          </span>
        </span>

        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
            className={`px-1.5 py-0.5 rounded transition ${activeMenu === 'file' ? 'bg-white/10' : 'hover:bg-white/5'}`}
          >
            File
          </button>
          {activeMenu === 'file' && (
            <div
              className="absolute left-0 top-7 w-48 bg-[#1f2026] border border-white/10 rounded-lg shadow-2xl py-1 z-50 text-[12px]"
              onMouseLeave={() => setActiveMenu(null)}
            >
              <button
                onClick={() => { onNewProject(); setActiveMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-600 flex justify-between items-center"
              >
                <span>New Project…</span>
                <span className="text-white/40 text-[10px]">⌘N</span>
              </button>
              <button
                onClick={() => { onNewQuery(); setActiveMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-600 flex justify-between items-center"
              >
                <span>New Query Prompt</span>
                <span className="text-white/40 text-[10px]">⌘T</span>
              </button>
              <div className="h-[1px] bg-white/10 my-1" />
              <button
                onClick={() => { onOpenCommandPalette(); setActiveMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-600 flex justify-between items-center"
              >
                <span>Quick Actions</span>
                <span className="text-white/40 text-[10px]">⌘K</span>
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
            className={`px-1.5 py-0.5 rounded transition ${activeMenu === 'view' ? 'bg-white/10' : 'hover:bg-white/5'}`}
          >
            View
          </button>
          {activeMenu === 'view' && (
            <div
              className="absolute left-0 top-7 w-52 bg-[#1f2026] border border-white/10 rounded-lg shadow-2xl py-1 z-50 text-[12px]"
              onMouseLeave={() => setActiveMenu(null)}
            >
              <button
                onClick={() => { onSwitchView('query'); setActiveMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-600 flex justify-between items-center"
              >
                <span>Natural Language Query</span>
                <span className="text-white/40 text-[10px]">⌘1</span>
              </button>
              <button
                onClick={() => { onSwitchView('schema'); setActiveMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-600 flex justify-between items-center"
              >
                <span>Schema Designer</span>
                <span className="text-white/40 text-[10px]">⌘2</span>
              </button>
              <button
                onClick={() => { onSwitchView('er'); setActiveMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-600 flex justify-between items-center"
              >
                <span>ER Diagram Graph</span>
                <span className="text-white/40 text-[10px]">⌘3</span>
              </button>
              <button
                onClick={() => { onSwitchView('ddl'); setActiveMenu(null); }}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-600 flex justify-between items-center"
              >
                <span>Export & Raw DDL</span>
                <span className="text-white/40 text-[10px]">⌘4</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onNewQuery}
          className="px-1.5 py-0.5 rounded hover:bg-white/5 transition text-white/70 hover:text-white"
        >
          Query
        </button>
        <button
          onClick={() => onSwitchView('schema')}
          className="px-1.5 py-0.5 rounded hover:bg-white/5 transition text-white/70 hover:text-white"
        >
          Schema
        </button>
      </div>

      {/* Right System Info */}
      <div className="flex items-center space-x-3 text-white/75">
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.06] text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <Database className="w-3 h-3 text-blue-400" />
          <span className="text-white/80 font-mono">{dialect}</span>
        </div>

        <button
          onClick={onOpenCommandPalette}
          className="hover:text-white transition p-1 hover:bg-white/10 rounded flex items-center space-x-1 text-[11px]"
          title="Command Palette (⌘K)"
        >
          <Search className="w-3 h-3" />
          <span className="text-white/50 text-[10px]">⌘K</span>
        </button>

        <Wifi className="w-3 h-3 text-white/70" />
        <Battery className="w-3.5 h-3.5 text-white/70" />
        <span className="text-white/80 font-medium pl-1">{time || '10:45 AM'}</span>
      </div>
    </div>
  );
};
