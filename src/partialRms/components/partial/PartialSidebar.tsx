import React, { useEffect, useState } from 'react';
import Icon from '../Icon';
import { useOrg } from '../../context/OrgContext';
import type { PartialModule, PartialSubModule } from './moduleMap';

export type { PartialModule, PartialSubModule };


interface Props {
  modules: PartialModule[];
  activeModule: string;
  activeSub: string;
  email: string | null;
  onSelect: (moduleKey: string, subKey: string) => void;
  onLogout: () => void;
}

/**
 * Sidebar for Partial-tier shells. Mirrors the integral Sidebar visual
 * language (orange pill, gradient interior, expandable sub-menus, profile
 * chip with inline logout), but is driven by an internal module/sub-module
 * state instead of hash routes — Partial shells don't use the integral router.
 */
const PartialSidebar: React.FC<Props> = ({ modules, activeModule, activeSub, email, onSelect, onLogout }) => {
  const { org } = useOrg();
  const appName = org?.branding?.app_name || 'Partial';
  const initial = (email || 'U').charAt(0).toUpperCase();

  const [open, setOpen] = useState<Record<string, boolean>>({ [activeModule]: true });
  useEffect(() => {
    if (!open[activeModule]) setOpen(p => ({ ...p, [activeModule]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule]);

  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

  return (
    <aside className="w-64 shrink-0 bg-transparent text-white flex flex-col self-stretch">
      <div className="ml-2 mr-3 mt-2 mb-3 flex-1 min-h-0 flex flex-col rounded-3xl bg-secondary/90 p-[3px] shadow-2xl">
        <div className="flex-1 min-h-0 flex flex-col rounded-[22px] bg-gradient-to-b from-primary to-primary-dark overflow-hidden">

          <div className="px-4 pt-4 pb-3 flex items-center gap-2 flex-shrink-0">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-white text-xs font-bold">
              {appName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{appName}</p>
              <p className="text-[10px] text-gray-300 truncate">Partial management</p>
            </div>
          </div>
          <div className="mx-3 border-b border-white/10" />

          <nav className="px-3 py-2 pb-4 flex-grow overflow-y-auto sidebar-nav-scroll">
            <ul className="space-y-1.5">
              {modules.map(m => {
                const isActive = activeModule === m.key;
                const isOpen = !!open[m.key];
                return (
                  <li key={m.key}>
                    <button
                      onClick={() => toggle(m.key)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-secondary/50 ${
                        isActive ? 'bg-secondary text-white font-semibold shadow-md' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <Icon name={m.icon} className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`} />
                        <span className="text-xs font-medium truncate">{m.name}</span>
                      </div>
                      <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />
                    </button>
                    {isOpen && (
                      <div className="py-2 pl-6 pr-2 mt-1 bg-black/15 rounded-xl">
                        <ul className="space-y-1">
                          {m.subModules.map(s => {
                            const isSubActive = activeModule === m.key && activeSub === s.key;
                            return (
                              <li key={s.key}>
                                <button
                                  onClick={() => onSelect(m.key, s.key)}
                                  className={`block w-full text-left transition-colors duration-200 truncate py-1 px-2 rounded-md text-xs ${
                                    isSubActive ? 'bg-white text-primary font-bold' : 'text-gray-300 hover:text-secondary hover:bg-white/5'
                                  }`}
                                >
                                  {s.name}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="m-2 mt-0 p-2 bg-black/25 rounded-2xl flex items-center gap-2">
            <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center font-bold text-white text-[11px] shrink-0">
              {initial}
            </div>
            <div className="overflow-hidden min-w-0 flex-1">
              <p className="text-white text-xs font-semibold truncate">{email || 'Signed in'}</p>
              <p className="text-gray-300 text-[10px] truncate">{appName}</p>
            </div>
            <button
              onClick={onLogout}
              title="Sign out"
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10"
            >
              <Icon name="offboarding" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default PartialSidebar;
