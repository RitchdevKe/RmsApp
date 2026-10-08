
import React, { useMemo } from 'react';
import { NAVIGATION_ITEMS } from '../../constants';
import { NavItem } from '../../types';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';

interface NavigationProps {
  activeRoute: string;
  isCollapsed: boolean;
  onItemClick: (path: string) => void;
}

const NavLink: React.FC<{ item: NavItem; isActive: boolean; isCollapsed: boolean; onClick: () => void; }> = ({ item, isActive, isCollapsed, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center px-4 py-3 transition-colors duration-200 group focus:outline-none focus:bg-white/10 ${isActive ? 'bg-secondary text-white font-semibold' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
      title={isCollapsed ? item.name : ''}
    >
      <div className="flex items-center justify-center w-6 h-6">
        <Icon name={item.icon} className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
      </div>
      {!isCollapsed && <span className="ml-3 text-sm truncate">{item.name}</span>}
    </button>
  );
};

const Navigation: React.FC<NavigationProps> = ({ activeRoute, isCollapsed, onItemClick }) => {
  const { currentUser, roles } = useData();

  // Helper to determine if a specific path key is allowed
  const isAllowed = (roleDef: any, pathKey: string) => {
      if (currentUser?.role === 'Super Admin') return true;
      return roleDef?.accessibleSubmodules?.includes(pathKey);
  };

  const visibleNavItems = useMemo(() => {
    if (!currentUser) return [];
    
    // Find current user's role definition
    const roleDef = roles.find(r => r.name === currentUser.role);
    if (!roleDef && currentUser.role !== 'Super Admin') return [];

    return NAVIGATION_ITEMS.map(item => {
        // Filter submodules for this item
        const accessibleSubs = item.subModules.filter(sub => 
            isAllowed(roleDef, `${item.name}/${sub}`)
        );

        // If no submodules are accessible, and it's not a direct module access (if any), hide it
        if (accessibleSubs.length === 0) return null;

        // Return item with only accessible submodules (though Navigation currently just renders the top level)
        // We attach the 'firstAccessibleSub' for the click handler
        return {
            ...item,
            subModules: accessibleSubs
        };
    }).filter(item => item !== null) as (NavItem & { subModules: string[] })[];

  }, [currentUser, roles]);

  return (
    <nav className="flex-grow overflow-y-auto py-4 space-y-1">
      {visibleNavItems.map((item) => {
        const modulePath = item.name.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');
        
        // Active state check
        const isActive = item.name === 'Dashboard' 
            ? (activeRoute === '#/' || activeRoute === '#/dashboard' || activeRoute.startsWith('#/dashboard'))
            : activeRoute.startsWith(`#/${modulePath}`);
            
        // Calculate the target path: Default to the first *accessible* submodule
        const firstSub = item.subModules[0];
        const subSlug = firstSub.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');
        
        let targetPath = `#/${modulePath}/${subSlug}`;
        if (item.name === 'Dashboard') {
            if (firstSub === 'Dashboard') targetPath = '#/dashboard';
            else if (firstSub === 'Quick Stats') targetPath = '#/dashboard/stats';
            else if (firstSub === 'Quick Search') targetPath = '#/dashboard/search';
        } else if (item.name === 'R-Reits') {
             targetPath = `#/r-reits/${subSlug}`; // R-Reits has simpler path structure in App.tsx
        } else if (item.name === 'User App Portal') {
             targetPath = `#/user-app-portal/${subSlug}`;
        }

        return (
          <NavLink
            key={item.name}
            item={item}
            isActive={isActive}
            isCollapsed={isCollapsed}
            onClick={() => onItemClick(targetPath)}
          />
        );
      })}
    </nav>
  );
};

export default Navigation;
