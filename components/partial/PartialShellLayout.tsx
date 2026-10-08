import React, { useEffect, useMemo, useState } from 'react';
import PartialSidebar from './PartialSidebar';
import PartialTopHeader from './PartialTopHeader';
import { BottomTabBar, type TabItem } from './ui/primitives';
import { filterModulesForRole, type PartialModule, type PartialRole } from './moduleMap';

interface Props {
  modules: PartialModule[];
  email: string | null;
  onLogout: () => void;
  /** Render the content for the active (module, sub) tuple. */
  renderContent: (moduleKey: string, subKey: string) => React.ReactNode;
  initial?: { module: string; sub: string };
  /** Filter sidebar + bottom tabs by role. Default is full menu (agency owner). */
  role?: PartialRole;
}

/**
 * Layout shell for Partial.
 * - Mobile (<md): top header, sidebar lives in a slide-over drawer,
 *   bottom tab bar shows the top-5 "primary" modules.
 * - Desktop (>=md): top header + collapsible left sidebar + scrollable main.
 *
 * Role-aware: pass `role` to hide sub-modules or whole modules from
 * roles that shouldn't see them (e.g. landlord shouldn't see Team & Roles).
 */
const PartialShellLayout: React.FC<Props> = ({
  modules: rawModules, email, onLogout, renderContent, initial, role = 'owner',
}) => {
  const modules = useMemo(() => filterModulesForRole(rawModules, role), [rawModules, role]);

  const first =
    initial ||
    { module: modules[0]?.key, sub: modules[0]?.subModules[0]?.key };
  const [active, setActive] = useState<{ module: string; sub: string }>(first);

  // Desktop sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  // Mobile sidebar drawer
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // Close mobile drawer whenever the route-equivalent state changes
  useEffect(() => { setMobileOpen(false); }, [active.module, active.sub]);

  const { moduleName, subName } = useMemo(() => {
    const m = modules.find(x => x.key === active.module);
    const s = m?.subModules.find(x => x.key === active.sub);
    return { moduleName: m?.name || '', subName: s?.name || '' };
  }, [modules, active]);

  const handleSelect = (moduleKey: string, subKey: string) => {
    setActive({ module: moduleKey, sub: subKey });
  };

  // Bottom-tab uses up-to-5 modules tagged primary, falls back to first 5.
  const tabs: TabItem[] = useMemo(() => {
    const picks = modules.filter(m => m.primary);
    const final = (picks.length ? picks : modules).slice(0, 5);
    return final.map(m => ({ key: m.key, label: m.name, icon: m.icon }));
  }, [modules]);

  // Toggle the sidebar: on mobile open the drawer; on desktop collapse panel.
  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setMobileOpen(o => !o);
    } else {
      setSidebarOpen(o => !o);
    }
  };

  const onTabSelect = (modKey: string) => {
    const m = modules.find(x => x.key === modKey);
    if (!m) return;
    setActive({ module: m.key, sub: m.subModules[0]?.key || '' });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <PartialTopHeader
        moduleName={moduleName}
        subName={subName}
        email={email}
        onLogout={onLogout}
        onToggleSidebar={toggleSidebar}
      />

      <div className="flex-1 min-h-0 flex relative">
        {/* Desktop sidebar */}
        <div className={`hidden md:block ${sidebarOpen ? '' : 'md:hidden'}`}>
          <PartialSidebar
            modules={modules}
            activeModule={active.module}
            activeSub={active.sub}
            email={email}
            onLogout={onLogout}
            onSelect={handleSelect}
          />
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
            <div className="relative z-10 animate-in slide-in-from-left">
              <PartialSidebar
                modules={modules}
                activeModule={active.module}
                activeSub={active.sub}
                email={email}
                onLogout={onLogout}
                onSelect={handleSelect}
              />
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 md:pb-6 relative">
          <div className="max-w-6xl mx-auto">{renderContent(active.module, active.sub)}</div>
        </main>
      </div>

      <BottomTabBar tabs={tabs} active={active.module} onSelect={onTabSelect} />
    </div>
  );
};

export default PartialShellLayout;
