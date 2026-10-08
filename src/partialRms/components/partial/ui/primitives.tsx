import React from 'react';
import Icon from '../../Icon';

/* ===========================================================
   Partial mobile-first primitives — WhatsApp-clean lens
   - rounded cards, big tap targets, tabular money,
     friendly empty states, skeletons, sticky FAB.
   =========================================================== */

/* ---------------- Money ---------------- */

export const fmtKES = (n: number | null | undefined): string => {
  const v = Number(n || 0);
  return `KSh ${v.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export const MoneyCell: React.FC<{ amount: number | null | undefined; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  amount, size = 'md', className = '',
}) => {
  const sizeCls = size === 'lg' ? 'text-xl font-bold' : size === 'sm' ? 'text-xs font-semibold' : 'text-sm font-semibold';
  return <span className={`tabular-nums tracking-tight text-slate-900 ${sizeCls} ${className}`}>{fmtKES(amount)}</span>;
};

/* ---------------- Status pills ---------------- */

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
const TONE: Record<PillTone, string> = {
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger:  'bg-danger-soft text-danger-ink',
  info:    'bg-blue-100 text-blue-800',
  neutral: 'bg-slate-100 text-slate-700',
};

export const StatusPill: React.FC<{ tone?: PillTone; children: React.ReactNode; className?: string }> = ({
  tone = 'neutral', children, className = '',
}) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${TONE[tone]} ${className}`}>
    {children}
  </span>
);

/* ---------------- List card ---------------- */

interface ListCardProps {
  leading?: React.ReactNode;         // avatar / icon
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;            // right-aligned top (e.g. money)
  metaSub?: React.ReactNode;         // right-aligned bottom (e.g. status pill / date)
  onClick?: () => void;
  actions?: React.ReactNode;         // shown on hover / always on mobile
  className?: string;
}

export const ListCard: React.FC<ListCardProps> = ({
  leading, title, subtitle, meta, metaSub, onClick, actions, className = '',
}) => {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`group bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 transition-all
        ${interactive ? 'hover:border-slate-300 hover:shadow-sm active:scale-[0.99] cursor-pointer' : ''}
        ${className}`}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</div>}
      </div>
      {(meta || metaSub) && (
        <div className="shrink-0 flex flex-col items-end gap-1">
          {meta && <div>{meta}</div>}
          {metaSub && <div>{metaSub}</div>}
        </div>
      )}
      {actions && <div className="shrink-0 ml-1">{actions}</div>}
    </div>
  );
};

/* ---------------- Avatar (initials) ---------------- */

export const Avatar: React.FC<{ name?: string | null; size?: number; className?: string }> = ({
  name, size = 40, className = '',
}) => {
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`rounded-full bg-gradient-to-br from-primary to-primary-dark text-white font-semibold flex items-center justify-center shrink-0 ${className}`}
    >
      {letter}
    </div>
  );
};

/* ---------------- Empty state ---------------- */

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
export const EmptyState: React.FC<EmptyStateProps> = ({ icon = 'communication', title, description, action }) => (
  <div className="bg-white rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
    <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
      <Icon name={icon} className="w-7 h-7 text-slate-400" />
    </div>
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    {description && <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">{description}</p>}
    {action && (
      <button
        onClick={action.onClick}
        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-xs font-semibold hover:bg-primary-dark active:scale-95 transition"
      >
        <Icon name="plus" className="w-3.5 h-3.5" />
        {action.label}
      </button>
    )}
  </div>
);

/* ---------------- Skeleton ---------------- */

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200/70 rounded ${className}`} />
);

export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
    ))}
  </div>
);

/* ---------------- Filter chips ---------------- */

interface ChipsProps<T extends string> {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}
export function FilterChips<T extends string>({ options, value, onChange, className = '' }: ChipsProps<T>) {
  return (
    <div className={`flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 ${className}`}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition border ${
              active
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            {o.label}
            {typeof o.count === 'number' && (
              <span className={`ml-1.5 ${active ? 'text-white/70' : 'text-slate-400'}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Section header ---------------- */

export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, className = '' }) => (
  <div className={`flex items-end justify-between gap-3 mb-3 ${className}`}>
    <div className="min-w-0">
      <h2 className="text-base font-semibold text-slate-900 truncate">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/* ---------------- KPI card ---------------- */

export const KpiCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: PillTone;
  icon?: string;
}> = ({ label, value, hint, tone = 'neutral', icon }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3">
    {icon && (
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${TONE[tone]}`}>
        <Icon name={icon} className="w-4 h-4" />
      </div>
    )}
    <div className="min-w-0 flex-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5 truncate">{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{hint}</div>}
    </div>
  </div>
);

/* ---------------- FAB ---------------- */

export const FAB: React.FC<{ icon?: string; label?: string; onClick: () => void; className?: string }> = ({
  icon = 'plus', label, onClick, className = '',
}) => (
  <button
    onClick={onClick}
    className={`fixed md:absolute right-4 bottom-20 md:bottom-6 z-30 h-14 px-5 rounded-full bg-primary text-white shadow-xl flex items-center gap-2 font-semibold text-sm hover:bg-primary-dark active:scale-95 transition ${className}`}
  >
    <Icon name={icon} className="w-5 h-5" />
    {label && <span className="hidden sm:inline">{label}</span>}
  </button>
);

/* ---------------- Detail drawer (mobile sheet / desktop side panel) ---------------- */

export const DetailDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}> = ({ open, onClose, title, subtitle, children, footer, widthClass = 'md:w-[480px]' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-stretch md:justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative bg-white w-full ${widthClass} max-h-[92vh] md:max-h-none md:h-full rounded-t-3xl md:rounded-none flex flex-col shadow-2xl animate-in slide-in-from-bottom md:slide-in-from-right`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden mx-auto mt-2 mb-1 w-10 h-1.5 rounded-full bg-slate-300" />
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            {title && <div className="text-base font-semibold text-slate-900 truncate">{title}</div>}
            {subtitle && <div className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
          >
            <Icon name="close" className="w-4 h-4 text-slate-600" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-slate-200 px-5 py-3 bg-slate-50">{footer}</div>}
      </div>
    </div>
  );
};

/* ---------------- Bottom tab bar (mobile) ---------------- */

export interface TabItem { key: string; label: string; icon: string; }

export const BottomTabBar: React.FC<{
  tabs: TabItem[];
  active: string;
  onSelect: (key: string) => void;
}> = ({ tabs, active, onSelect }) => (
  <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 pb-safe">
    <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
      {tabs.map(t => {
        const isActive = t.key === active;
        return (
          <li key={t.key}>
            <button
              onClick={() => onSelect(t.key)}
              className={`w-full py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-medium transition ${
                isActive ? 'text-primary' : 'text-slate-500'
              }`}
            >
              <Icon name={t.icon} className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-slate-500'}`} />
              {t.label}
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);
