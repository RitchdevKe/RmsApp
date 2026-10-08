import React, { useEffect, useState } from 'react';

interface Props {
  email: string | null;
  appName: string;
  subdomain?: string | null;
  moduleName: string;
  subName?: string;
  onToggleSidebar: () => void;
  onLogout: () => void;
}

/**
 * Integral top header — curved gradient band in the main app's primary
 * red (#9D1F15) with an amber ring (#F39C2A) to read as "platform control
 * plane" while staying on-brand with Task-Me Realty.
 */
const IntegralTopHeader: React.FC<Props> = ({
  email, appName, subdomain, moduleName, subName, onToggleSidebar, onLogout,
}) => {
  const [, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const initial = (email || 'IN').slice(0, 2).toUpperCase();
  const breadcrumb = subName ? `${moduleName} / ${subName}` : moduleName;

  return (
    <header className="w-full bg-slate-950">
      <div className="bg-secondary/80 p-[3px] pt-0 rounded-b-[32px] shadow-2xl">
        <div className="rounded-b-[28px] bg-gradient-to-r from-primary-dark via-primary to-primary-light h-[68px] flex items-center justify-between gap-3 pl-2 pr-3 sm:pl-3 sm:pr-4">

          {/* Left: hamburger + brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={onToggleSidebar}
              aria-label="Toggle navigation"
              className="text-white hover:bg-white/15 active:bg-white/25 p-2 rounded-full transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>

            <div className="h-11 w-11 sm:h-12 sm:w-12 bg-white rounded-full flex items-center justify-center shadow-md overflow-hidden border-2 border-white shrink-0">
              <span className="text-primary font-extrabold text-base tracking-tight">TM</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-white text-sm sm:text-base font-bold tracking-tight truncate">{appName}</h1>
                <span className="hidden sm:inline-flex items-center text-[10px] uppercase tracking-wider bg-secondary text-primary-dark font-bold px-2 py-0.5 rounded-full">Super-admin</span>
              </div>
              <p className="text-[11px] text-white/80 truncate">{breadcrumb}{subdomain ? ` · ${subdomain}` : ''}</p>
            </div>
          </div>

          {/* Right: identity */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-white text-[11px] font-medium truncate max-w-[180px]">{email}</span>
              <span className="text-white/70 text-[10px]">Integral platform</span>
            </div>
            <div className="h-9 w-9 rounded-full bg-secondary text-primary-dark font-bold text-xs flex items-center justify-center border-2 border-white/40">
              {initial}
            </div>
            <button
              onClick={onLogout}
              aria-label="Sign out"
              title="Sign out"
              className="text-white hover:bg-white/15 active:bg-white/25 p-2 rounded-full transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m10 17-5-5 5-5M15 12H5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default IntegralTopHeader;
