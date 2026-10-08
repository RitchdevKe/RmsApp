import React, { useState } from 'react';

export interface IntegralModule {
  key: string;
  name: string;
  icon: React.ReactNode;
  subModules: { key: string; name: string }[];
}

interface Props {
  modules: IntegralModule[];
  active: { module: string; sub: string };
  email: string | null;
  onSelect: (moduleKey: string, subKey: string) => void;
  onLogout: () => void;
}

/**
 * Integral side nav — pill-on-ring shape in the main app's brand
 * (primary red gradient + amber accents).
 */
const IntegralSidebar: React.FC<Props> = ({ modules, active, email, onSelect, onLogout }) => {
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [active.module]: true }));
  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));
  const initial = (email || 'IN').slice(0, 1).toUpperCase();

  return (
    <aside className="w-[260px] shrink-0 flex flex-col bg-slate-950" aria-label="Integral sidebar">
      <div className="ml-2 mr-3 mt-2 mb-3 flex-1 min-h-0 flex flex-col rounded-3xl bg-secondary/80 p-[3px] shadow-2xl">
        <div className="flex-1 min-h-0 flex flex-col rounded-[22px] bg-gradient-to-b from-primary via-primary-dark to-[#5a0f08] overflow-hidden">

          {/* Tier filter at the top */}
          <div className="px-3 pt-4 pb-2 flex-shrink-0">
            <div className="relative">
              <select
                className="w-full px-2 py-2 text-xs text-white bg-black/30 border border-white/10 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-secondary"
                aria-label="Tier filter"
              >
                <option>All tiers</option>
                <option>Agency</option>
                <option>Partial</option>
                <option>Self-manage</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white/60">
                <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <div className="mt-3 border-b border-white/10 w-full" />
          </div>

          <nav className="px-3 py-2 pb-4 flex-grow overflow-y-auto sidebar-nav-scroll">
            <ul className="space-y-1.5">
              {modules.map(m => {
                const isActiveMod = active.module === m.key;
                const isOpen = !!open[m.key];
                return (
                  <li key={m.key}>
                    <button
                      onClick={() => toggle(m.key)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-secondary/60 ${
                        isActiveMod ? 'bg-secondary text-primary-dark font-semibold shadow-md' : 'text-white/90 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 shrink-0 inline-flex items-center justify-center ${isActiveMod ? 'text-primary-dark' : 'text-secondary'}`}>
                          {m.icon}
                        </span>
                        <span className="text-xs font-medium truncate">{m.name}</span>
                      </div>
                      <svg viewBox="0 0 24 24" className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="py-2 pl-6 pr-2 mt-1 bg-black/20 rounded-xl">
                        <ul className="space-y-1">
                          {m.subModules.map(s => {
                            const isSubActive = active.module === m.key && active.sub === s.key;
                            return (
                              <li key={s.key}>
                                <button
                                  onClick={() => onSelect(m.key, s.key)}
                                  className={`block w-full text-left text-[11px] py-1.5 px-2 rounded-md transition-colors truncate ${
                                    isSubActive ? 'bg-white text-primary font-bold' : 'text-white/80 hover:text-secondary hover:bg-white/5'
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

          {/* Footer identity chip */}
          <div className="m-2 mt-0 p-2 bg-black/30 rounded-2xl flex items-center gap-2">
            <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center font-bold text-primary-dark text-[11px] shrink-0">
              {initial}
            </div>
            <div className="overflow-hidden min-w-0 flex-1">
              <p className="text-white text-[11px] font-semibold truncate uppercase">Super admin</p>
              <p className="text-white/60 text-[10px] truncate">{email || ''}</p>
            </div>
            <button
              onClick={onLogout}
              aria-label="Sign out"
              title="Sign out"
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m10 17-5-5 5-5M15 12H5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default IntegralSidebar;
