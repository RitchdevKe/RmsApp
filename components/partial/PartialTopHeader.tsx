import React, { useEffect, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import Icon from '../Icon';
import { fmtDate } from '../../utils/date';
import { getEatGreeting } from '../../utils/greeting';

interface Props {
  moduleName: string;
  subName: string;
  email: string | null;
  onLogout: () => void;
  onToggleSidebar?: () => void;
}

/**
 * Top header for Partial shells — mirrors the agency Header visual
 * language (gradient pill band with hamburger, logo, identity, date
 * pill, mail/bell icons, avatar) but is decoupled from the agency
 * DataContext. Notifications and messages are stubbed and can be
 * wired up later.
 */
const PartialTopHeader: React.FC<Props> = ({ moduleName, subName, email, onLogout, onToggleSidebar }) => {
  const { org } = useOrg();
  const appName = org?.branding?.app_name || org?.name || 'Partial';
  const logo = org?.branding?.logo_url || null;
  const initial = (email || appName || 'U').charAt(0).toUpperCase();

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const greeting = getEatGreeting(now);
  const firstName = (email?.split('@')[0] || 'there').split('.')[0];
  const breadcrumb = [moduleName, subName].filter(Boolean).join(' / ');

  return (
    <header id="app-header" className="app-header w-full bg-transparent sticky top-0 z-30">
      <div className="relative">
        <div className="bg-secondary/90 p-[3px] pt-0 rounded-b-[32px] shadow-xl">
          <div className="rounded-b-[28px] bg-gradient-to-r from-primary to-primary-dark h-[68px] flex items-center justify-between gap-3 pl-2 pr-3 sm:pl-3 sm:pr-4">

            {/* Left cluster */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              {onToggleSidebar && (
                <button
                  onClick={onToggleSidebar}
                  aria-label="Toggle navigation"
                  className="text-white hover:bg-white/15 active:bg-white/25 p-2 rounded-full transition-colors"
                >
                  <Icon name="menu" className="w-5 h-5" />
                </button>
              )}

              <div className="h-11 w-11 sm:h-12 sm:w-12 bg-white rounded-full flex items-center justify-center shadow-md overflow-hidden border-2 border-white shrink-0">
                {logo
                  ? <img src={logo} alt="Logo" className="h-full w-full object-contain p-1" />
                  : <Icon name="branch" className="w-5 h-5 text-primary" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-white/80 text-[11px] sm:text-xs leading-none">{greeting},</p>
                <p className="text-white font-extrabold text-base sm:text-lg leading-tight truncate uppercase tracking-wide">
                  {firstName}
                </p>
                <p className="text-white/75 text-[10px] sm:text-[11px] leading-tight truncate hidden sm:block">
                  {appName}{breadcrumb ? ` · ${breadcrumb}` : ''}
                </p>
              </div>
            </div>

            {/* Right cluster */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="hidden sm:flex bg-white/15 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/15">
                {fmtDate(now)}
              </div>

              <button
                type="button"
                className="bg-white/15 hover:bg-white/25 text-white p-2 rounded-full transition-colors"
                aria-label="Messages"
                title="Messages"
              >
                <Icon name="mail" className="w-4 h-4" />
              </button>

              <button
                type="button"
                className="bg-white/15 hover:bg-white/25 text-white p-2 rounded-full transition-colors relative"
                aria-label="Notifications"
                title="Notifications"
              >
                <Icon name="bell" className="w-4 h-4" />
              </button>

              {/* Avatar */}
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-sm border-2 border-white/60 shadow-md overflow-hidden">
                <span>{initial}</span>
              </div>

              <button
                onClick={onLogout}
                aria-label="Sign out"
                title="Sign out"
                className="text-white/85 hover:text-white hover:bg-white/15 p-2 rounded-full transition-colors"
              >
                <Icon name="offboarding" className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default PartialTopHeader;
