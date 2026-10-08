import React, { useState, useEffect, useMemo } from 'react';
import { NAVIGATION_ITEMS } from '../constants';
import { NavItem } from '../types';
import Icon from './Icon';
import { useData } from '../context/DataContext';
import { useProfileDisplay } from '../hooks/useProfileDisplay';

interface SidebarProps {
  activeRoute: string;
  isOpen: boolean;
  closeSidebarMobile: () => void;
  onLogout?: () => void;
}


const NavLink: React.FC<{ item: NavItem; isActive: boolean; isSubMenuOpen: boolean; toggleSubMenu: () => void; activeRoute: string; onClick: () => void; }> = ({ item, isActive, isSubMenuOpen, toggleSubMenu, activeRoute, onClick }) => {

  const generatePath = (parentName: string, subName: string): string => {
    if (parentName === 'R-Reits') {
        const subSlug = subName.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');
        return `#/r-reits/${subSlug}`;
    }
    const parentSlug = parentName.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');
    const subSlug = subName.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');
    if (parentName === 'Dashboard') {
        if (subName === 'Dashboard') return '#/dashboard';
        if (subName === 'Quick Stats') return '#/dashboard/stats';
        if (subName === 'Quick Search') return '#/dashboard/search';
    }
    return `#/${parentSlug}/${subSlug}`;
  };

  const handleSubmoduleClick = (path: string) => {
    window.location.hash = path;
    onClick();
  };

  return (
    <div className="text-xs">
      <button
        onClick={toggleSubMenu}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-secondary/50 ${isActive ? 'bg-secondary text-white font-semibold shadow-md' : 'text-gray-200 hover:bg-white/10 hover:text-white'}`}
        aria-expanded={isSubMenuOpen}
      >
        <div className="flex items-center space-x-2 min-w-0">
          <Icon name={item.icon} className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`} />
          <span className="font-medium truncate">{item.name}</span>
        </div>
        <Icon name={isSubMenuOpen ? 'chevron-up' : 'chevron-down'} className={`w-3 h-3 ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`} />
      </button>
      {isSubMenuOpen && (
        <div className="py-2 pl-6 pr-2 mt-1 bg-black/15 rounded-xl">
          <ul className="space-y-1">
            {item.subModules.map(sub => {
              const path = generatePath(item.name, sub);
              const isSubActive = activeRoute === path;
              return (
                 <li key={sub}>
                   <button
                     onClick={() => handleSubmoduleClick(path)}
                     className={`block w-full text-left transition-colors duration-200 focus:outline-none truncate py-1 px-2 rounded-md ${isSubActive ? 'bg-white text-primary font-bold' : 'text-gray-300 hover:text-secondary hover:bg-white/5'}`}
                   >
                     {sub}
                   </button>
                 </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

const PORTAL_ONLY_ROLES = new Set(['Tenant', 'Landlord', 'Investor', 'Caretaker', 'Affiliate', 'Contractor', 'Fundi', 'Field Agent']);
const PORTAL_ALLOWED_MODULES = new Set(['User App Portal', 'R-Reits']);

const getPortalFallbackSubmodules = (role: string): string[] => {
    const common = ['Refer & Earn', 'My Profile'];
    if (role === 'Tenant') return ['Tenant Portal', ...common];
    if (role === 'Landlord') return ['Landlords Portal', ...common];
    if (role === 'Field Agent') return ['Agent Portal', ...common];
    if (role === 'Caretaker') return ['Caretaker Portal', ...common];
    if (role === 'Investor') return ['Investors Portal', 'Overview', 'Investment Plans', 'Portfolio Performance', ...common];
    if (role === 'Affiliate') return ['Affiliate Portal', ...common];
    if (role === 'Contractor' || role === 'Fundi') return ['Contractor Portal', ...common];
    return [];
};

const Sidebar: React.FC<SidebarProps> = ({ activeRoute, isOpen, closeSidebarMobile, onLogout }) => {
  const { currentUser, roles } = useData();
  const { displayName, initial, email, loading: profileLoading } = useProfileDisplay({ nameFallback: currentUser?.name });

  const userRole = roles.find(r => r.name === currentUser?.role);
  const isPortalOnlyUser = !!currentUser?.role && PORTAL_ONLY_ROLES.has(currentUser.role);

  const applyRoleSubFilter = (items: NavItem[]): NavItem[] => {
    // Super Admin
    if (currentUser?.role === 'Super Admin') return items;

    // If roles are not loaded yet, use hardcoded safe fallbacks for portal-only roles to prevent flashing other portal tabs
    if (roles.length === 0) {
      if (isPortalOnlyUser && currentUser?.role) {
        const fallbacks = getPortalFallbackSubmodules(currentUser.role);
        return items.map(item => {
          const allowedSubs = item.subModules.filter(sub => fallbacks.includes(sub));
          if (allowedSubs.length === 0) return null;
          return { ...item, subModules: allowedSubs };
        }).filter(Boolean) as NavItem[];
      }
      return items;
    }

    let accessible = userRole?.accessibleSubmodules || [];
    if (accessible.length === 0 && isPortalOnlyUser && currentUser?.role) {
      const fallbacks = getPortalFallbackSubmodules(currentUser.role);
      accessible = fallbacks.map(sub => `User App Portal/${sub}`);
    }

    // If role has no explicit allow list, fall back to current behavior (show nothing extra)
    return items.map(item => {
      const allowedSubs = item.subModules.filter(sub =>
        accessible.includes(`${item.name}/${sub}`) || accessible.includes(item.name)
      );
      if (allowedSubs.length === 0) return null;
      return { ...item, subModules: allowedSubs };
    }).filter(Boolean) as NavItem[];
  };

  const filteredNav = isPortalOnlyUser
    ? applyRoleSubFilter((NAVIGATION_ITEMS as NavItem[]).filter(item => PORTAL_ALLOWED_MODULES.has(item.name)))
    : applyRoleSubFilter(NAVIGATION_ITEMS as NavItem[]);


  const getActiveModuleFromRoute = (route: string) => {
    if (route.startsWith('#/dashboard')) return 'Dashboard';
    if (route.startsWith('#/registration')) return 'Registration';
    if (route.startsWith('#/tenants')) return 'Tenants';
    if (route.startsWith('#/landlords')) return 'Landlords';
    if (route.startsWith('#/payments')) return 'Payments';
    if (route.startsWith('#/general-operations')) return 'Operations';
    if (route.startsWith('#/operations')) return 'Operations';
    if (route.startsWith('#/field-operations')) return 'Operations';
    if (route.startsWith('#/hr-payroll')) return 'HR & Payroll';
    if (route.startsWith('#/communication')) return 'Operations';
    if (route.startsWith('#/accounting')) return 'Accounting';
    if (route.startsWith('#/maintenance')) return 'Operations';
    if (route.startsWith('#/leases')) return 'Operations';
    if (route.startsWith('#/analytics')) return 'Reports & Analytics';
    if (route.startsWith('#/reports')) return 'Reports & Analytics';
    if (route.startsWith('#/user-app-portal')) return 'User App Portal';
    if (route.startsWith('#/marketplace')) return 'Marketplace';
    if (route.startsWith('#/website')) return 'Website';
    if (route.startsWith('#/r-reits')) return 'R-Reits';
    if (route.startsWith('#/settings')) return 'Settings';
    return 'Dashboard';
  };

  const activeModule = getActiveModuleFromRoute(activeRoute);
  const [openSubMenus, setOpenSubMenus] = useState<{[key: string]: boolean}>({ [activeModule]: true });

  useEffect(() => {
    const currentModule = getActiveModuleFromRoute(activeRoute);
    if (!openSubMenus[currentModule]) {
      setOpenSubMenus(prev => ({ ...prev, [currentModule]: true }));
    }
  }, [activeRoute]);

  const toggleSubMenu = (name: string) => {
    setOpenSubMenus(prev => ({...prev, [name]: !prev[name]}));
  };

  const showBranchSelector = useMemo(() => {
    if (currentUser?.role === 'Super Admin') return true;
    return userRole?.isSystem || currentUser?.role === 'Landlord';
  }, [userRole, currentUser]);

  return (
    <aside
      id="main-nav"
      className="app-sidebar bg-transparent text-white flex flex-col"
      aria-label="Sidebar"
    >
      {/* Curved pill wrapper with orange outer ring (per reference 2) */}
      <div className="ml-0 mr-3 mt-1 mb-3 flex-1 min-h-0 flex flex-col rounded-3xl bg-secondary/90 p-[3px] shadow-2xl">
        <div className="flex-1 min-h-0 flex flex-col rounded-[22px] bg-gradient-to-b from-primary to-primary-dark overflow-hidden">

          {showBranchSelector && (
            <div className="px-3 pt-4 pb-2 flex-shrink-0">
              <div className="relative">
                <select
                  className="w-full px-2 py-2 text-xs text-white bg-black/25 border border-white/10 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-secondary"
                  aria-label="Branch filter"
                >
                  <option>All Branches</option>
                  <option>Kericho</option>
                  <option>Kisii</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-300">
                  <Icon name="chevron-down" className="w-3 h-3" />
                </div>
              </div>
              <div className="mt-3 border-b border-white/10 w-full"></div>
            </div>
          )}

          <nav className={`px-3 py-2 pb-4 flex-grow overflow-y-auto sidebar-nav-scroll ${!showBranchSelector ? 'pt-4' : ''}`}>
            <ul className="space-y-1.5">
              {filteredNav.map(item => (
                <li key={item.name}>
                  <NavLink
                    item={item}
                    isActive={activeModule === item.name}
                    isSubMenuOpen={!!openSubMenus[item.name]}
                    toggleSubMenu={() => toggleSubMenu(item.name)}
                    activeRoute={activeRoute}
                    onClick={closeSidebarMobile}
                  />
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer profile chip with inline logout (per design reference) */}
          <div className="m-2 mt-0 p-2 bg-black/25 rounded-2xl flex items-center gap-2">
            <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center font-bold text-white text-[11px] shrink-0">
              {profileLoading ? '…' : (initial || 'U')}
            </div>
            <div className="overflow-hidden min-w-0 flex-1">
              <p className="text-white text-xs font-semibold truncate uppercase">{displayName}</p>
              <p className="text-gray-300 text-[10px] truncate">{email || currentUser?.email || ''}</p>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                aria-label="Log out"
                title="Log out"
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors"
              >
                <Icon name="offboarding" className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
