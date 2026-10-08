import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import { useData } from '../context/DataContext';
import { useProfileDisplay } from '../hooks/useProfileDisplay';
import { uploadToBucket } from '../utils/supabaseStorage';
import { supabase } from '../utils/supabaseClient';
import { getEatGreeting, isUserPortalRoute, routeBreadcrumb, parseHashQuery } from '../utils/greeting';
import { fmtDate } from '../utils/date';



interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, isSidebarOpen, onLogout }) => {
  const { systemSettings, updateSystemSettings, notifications, currentUser, markAllNotificationsRead, dismissNotification, clearOldNotifications, tenants } = useData();

  const { initial: profileInitial, displayName } = useProfileDisplay({ nameFallback: currentUser?.name });
  const { logo, profilePic, companyName } = systemSettings;
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Re-render greeting once an hour so morning/afternoon/evening flips correctly.
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // React to hash changes so breadcrumb/portal detection stays live.
  const [hash, setHash] = useState<string>(window.location.hash || '#/dashboard');
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/dashboard');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const isPortal = isUserPortalRoute(hash);
  const greeting = getEatGreeting(now);
  const firstName = (displayName || currentUser?.name || 'there').split(' ')[0];
  // If the hash carries a ?tenantId=... param, swap the raw id for the tenant's
  // display name so the breadcrumb reads "Tenants / Active Tenants / Peter G."
  // instead of "Tenants / Active Tenants?tenantId=...".
  const hashQuery = parseHashQuery(hash);
  const tenantIdParam = hashQuery.tenantId;
  const resolvedTenantName = tenantIdParam
    ? (tenants || []).find((t: any) => t.id === tenantIdParam)?.name
    : undefined;
  const breadcrumb = routeBreadcrumb(hash, resolvedTenantName);


  const navigate = (path: string) => { window.location.hash = path; };

  const isAdmin = (role: string) => role === 'Super Admin' || role === 'Assistant Admin';
  const visibleNotifications = notifications.filter(n =>
    n.recipientRole === 'All' ||
    n.recipientRole === (currentUser as any)?.role ||
    (n.recipientRole === 'Super Admin' && isAdmin((currentUser as any)?.role ?? ''))
  );
  const unreadCount = visibleNotifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width, height = img.height;
          if (width > height) {
            if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
          } else {
            if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
          }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(file.type));
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const file = e.target.files[0];
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const ext = file.name.split('.').pop() || 'jpg';
          const path = `${user.id}/header-profile-${Date.now()}.${ext}`;
          const url = await uploadToBucket('profile-pictures', path, file);
          updateSystemSettings({ profilePic: url });
        } else {
          const resizedPic = await resizeImage(file, 150, 150);
          updateSystemSettings({ profilePic: resizedPic });
        }
      } catch (error) {
        console.error('Error processing profile pic', error);
      }
    }
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'Success': return { icon: 'check', color: 'text-green-500' };
      case 'Warning': return { icon: 'arrears', color: 'text-red-500' };
      case 'Alert':   return { icon: 'bell',  color: 'text-yellow-500' };
      default:        return { icon: 'info',  color: 'text-blue-500' };
    }
  };

  return (
    <header id="app-header" className="app-header w-full bg-transparent">
      {/* Full-width band, bottom corners curved only (touches page edges) */}
      <div className="relative">
        <div className="bg-secondary/90 p-[3px] pt-0 rounded-b-[32px] shadow-xl">
          <div className="rounded-b-[28px] bg-gradient-to-r from-primary to-primary-dark h-[68px] flex items-center justify-between gap-3 pl-2 pr-3 sm:pl-3 sm:pr-4">


            {/* Left cluster: hamburger + logo + identity */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button
                onClick={onToggleSidebar}
                aria-label="Toggle navigation"
                className="text-white hover:bg-white/15 active:bg-white/25 p-2 rounded-full transition-colors"
              >
                <Icon name="menu" className="w-5 h-5" />
              </button>

              <div className="h-11 w-11 sm:h-12 sm:w-12 bg-white rounded-full flex items-center justify-center shadow-md overflow-hidden border-2 border-white shrink-0">
                {logo
                  ? <img src={logo} alt="Logo" className="h-full w-full object-contain p-1" />
                  : <Icon name="branch" className="w-5 h-5 text-primary" />}
              </div>

              {/* Identity block — flips between greeting (user portals) and company (admin) */}
              <div className="min-w-0 flex-1 lg:max-w-xs">
                {isPortal ? (
                  <>
                    <p className="text-white/80 text-[11px] sm:text-xs leading-none">{greeting},</p>
                    <p className="text-white font-extrabold text-base sm:text-lg leading-tight truncate uppercase tracking-wide">
                      {firstName}
                    </p>
                    <p className="text-white/70 text-[10px] sm:text-[11px] leading-tight truncate">{breadcrumb}</p>
                  </>
                ) : (
                  <>
                    <p className="text-white font-extrabold text-sm sm:text-lg leading-tight truncate uppercase tracking-wider">
                      {companyName || 'Task-Me'}
                    </p>
                    <p className="text-white/75 text-[10px] sm:text-[11px] leading-tight truncate hidden sm:block">{breadcrumb}</p>
                  </>
                )}
              </div>
            </div>

            {/* Center cluster: Application Mode Toggle (Admin / Super Admin Only) */}
            {!isPortal && (currentUser?.role === 'Super Admin' || currentUser?.role === 'Admin') && (
              <div className="flex items-center justify-center absolute left-1/2 -translate-x-1/2 bg-black/20 p-1 rounded-lg border border-white/10 z-10 scale-90 sm:scale-100 origin-center">
                <button 
                  onClick={() => {
                    const currentHash = window.location.hash || '#/dashboard';
                    if (currentHash.startsWith('#/partial-rms')) {
                      let target = currentHash.replace('#/partial-rms', '#');
                      if (target === '#' || target === '#/') {
                        target = '#/dashboard';
                      }
                      window.location.hash = target;
                    } else {
                      window.location.hash = '#/dashboard';
                    }
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all tracking-wider ${
                    !hash.includes('partial') 
                      ? 'bg-secondary text-white shadow-sm' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  FULL RMS
                </button>
                <div className="w-px h-4 bg-white/20 mx-1"></div>
                <button 
                  onClick={() => {
                    const currentHash = window.location.hash || '#/dashboard';
                    if (!currentHash.startsWith('#/partial-rms')) {
                      let clean = currentHash;
                      if (clean.startsWith('#/')) {
                        clean = clean.substring(2);
                      } else if (clean.startsWith('#')) {
                        clean = clean.substring(1);
                      }
                      if (!clean || clean === 'dashboard') {
                        window.location.hash = '#/partial-rms/dashboard';
                      } else if (clean.startsWith('r-reits')) {
                        // R-Reits is not supported in Partial RMS mode
                        window.location.hash = '#/partial-rms/dashboard';
                      } else {
                        window.location.hash = `#/partial-rms/${clean}`;
                      }
                    } else {
                      window.location.hash = '#/partial-rms/dashboard';
                    }
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all tracking-wider ${
                    hash.includes('partial') 
                      ? 'bg-secondary text-white shadow-sm' 
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  PARTIAL
                </button>
              </div>
            )}

            {/* Right cluster: date pill + icons + avatar */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="hidden sm:flex bg-white/15 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/15">
                {fmtDate(now)}
              </div>

              <button
                onClick={() => navigate('#/operations/communications/inbound')}
                className="bg-white/15 hover:bg-white/25 text-white p-2 rounded-full transition-colors"
                aria-label="Messages"
              >
                <Icon name="mail" className="w-4 h-4" />
              </button>

              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setIsNotifOpen(prev => { if (!prev) markAllNotificationsRead(); return !prev; })}
                  className={`bg-white/15 hover:bg-white/25 text-white p-2 rounded-full transition-colors relative ${isNotifOpen ? 'bg-white/30 ring-2 ring-white/40' : ''}`}
                  aria-label="Notifications"
                >
                  <Icon name="bell" className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-secondary rounded-full border border-primary"></span>
                  )}
                </button>

                {isNotifOpen && (
                  <div className="absolute right-0 mt-3 w-80 max-w-[92vw] bg-white rounded-2xl shadow-2xl overflow-hidden z-50 animate-fade-in border border-gray-200">
                    <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                      <h3 className="font-bold text-gray-700 text-sm">Notifications</h3>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{unreadCount} new</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {visibleNotifications.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">No new notifications.</div>
                      ) : (
                        visibleNotifications.map(notif => {
                          const { icon, color } = getNotifIcon(notif.type);
                          return (
                            <div key={notif.id} className={`p-3 border-b hover:bg-gray-50 flex gap-3 ${!notif.read ? 'bg-blue-50/30' : ''}`}>
                              <div className={`mt-1 flex-shrink-0 ${color}`}>
                                <Icon name={icon} className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800">{notif.title}</p>
                                <p className="text-xs text-gray-600 line-clamp-2">{notif.message}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{notif.date}</p>
                              </div>
                              <button onClick={() => dismissNotification(notif.id)} className="flex-shrink-0 text-gray-300 hover:text-red-400 mt-1" title="Dismiss">
                                <Icon name="close" className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="p-2 border-t bg-gray-50 flex items-center justify-between gap-2">
                      <button onClick={clearOldNotifications} className="text-xs text-gray-500 hover:text-red-500 font-semibold">Clear Older</button>
                      <button onClick={() => navigate('#/operations/communications/inbound')} className="text-xs font-bold text-primary hover:underline">View All</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Avatar */}
              <label className="cursor-pointer relative group" title="Upload Profile Picture">
                <input type="file" accept="image/*" className="hidden" onChange={handleProfileUpload} />
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-sm border-2 border-white/60 shadow-md overflow-hidden group-hover:border-white transition-all">
                  {profilePic
                    ? <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                    : <span>{profileInitial}</span>}
                </div>
              </label>

              {/* Logout moved to sidebar profile card per design reference */}

            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
