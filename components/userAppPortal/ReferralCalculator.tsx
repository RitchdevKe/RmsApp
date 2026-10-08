import React, { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { useData } from '../../context/DataContext';

/**
 * Compact Referral Earnings Simulator.
 * Compact widget — starts fully expanded.
 */

const MINI_SLIDER: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  accent: string;
}> = ({ label, value, min, max, step, onChange, format, accent }) => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="text-[11px] text-slate-400 w-14 shrink-0 truncate">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 min-w-0 h-1 rounded-full appearance-none cursor-pointer"
      style={{
        background: `linear-gradient(to right, ${accent} 0%, ${accent} ${((value - min) / (max - min)) * 100}%, #334155 ${((value - min) / (max - min)) * 100}%, #334155 100%)`,
      }}
    />
    <span className="text-[11px] font-bold w-[72px] text-right shrink-0 tabular-nums" style={{ color: accent }}>
      {format ? format(value) : value}
    </span>
  </div>
);

const ReferralCalculator: React.FC<{ hideTenant?: boolean }> = ({ hideTenant = false }) => {
  const { commissionRules } = useData();
  const [open, setOpen] = useState(true);

  const tenantRule = commissionRules.find(r => r.trigger === 'Tenancy Referral');
  const landlordRule = commissionRules.find(r => r.trigger === 'Property Management Referral');
  const investorRule = commissionRules.find(r => (r.trigger as string) === 'Investor Referral');

  const tenantMin = tenantRule?.rateType === 'KES' ? tenantRule.rateValue : 200;
  const tenantPctRate = tenantRule?.rateType === '%' ? tenantRule.rateValue : 10;
  const landlordPct = landlordRule?.rateType === '%' ? landlordRule.rateValue : 10;
  const investorYearly = investorRule?.rateType === '%' ? investorRule.rateValue : 5;
  const investorOneOff = 2.5;

  // Inputs
  const [tenantCount, setTenantCount] = useState(5);
  const [avgRent, setAvgRent] = useState(20000);
  const [landlordCount, setLandlordCount] = useState(2);
  const [avgRentRoll, setAvgRentRoll] = useState(300000);
  const [mgmtFeePct, setMgmtFeePct] = useState(8);
  const [contractMonths, setContractMonths] = useState(12);
  const [investorCount, setInvestorCount] = useState(3);
  const [avgInvestment, setAvgInvestment] = useState(100000);
  const [investorMode, setInvestorMode] = useState<'oneoff' | 'yearly'>('yearly');
  const [investmentYears, setInvestmentYears] = useState(2);

  const calc = useMemo(() => {
    const tenantPer = tenantRule?.rateType === 'KES' ? tenantRule.rateValue : Math.round(avgRent * (tenantPctRate / 100));
    const tenantTotal = tenantPer * tenantCount;
    const monthlyMgmtFee = avgRentRoll * (mgmtFeePct / 100);
    const landlordPerMonth = monthlyMgmtFee * (landlordPct / 100);
    const landlordTotal = landlordPerMonth * contractMonths * landlordCount;
    const landlordMonthlyAll = landlordPerMonth * landlordCount;

    let investorPer = 0;
    if (investorMode === 'oneoff') {
      investorPer = avgInvestment * (investorOneOff / 100);
    } else {
      investorPer = avgInvestment * (investorYearly / 100) * investmentYears;
    }
    const investorTotal = investorPer * investorCount;
    const investorYearlyAll = investorMode === 'yearly'
      ? avgInvestment * (investorYearly / 100) * investorCount
      : 0;

    return {
      tenantPer, tenantTotal: hideTenant ? 0 : tenantTotal,
      landlordPerMonth, landlordMonthlyAll, landlordTotal,
      investorPer, investorYearlyAll, investorTotal,
      grandTotal: (hideTenant ? 0 : tenantTotal) + landlordTotal + investorTotal,
    };
  }, [tenantCount, avgRent, tenantMin, tenantPctRate,
      landlordCount, avgRentRoll, mgmtFeePct, contractMonths, landlordPct,
      investorCount, avgInvestment, investorMode, investmentYears, investorYearly]);

  const fmt = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

  // Mini summary values
  const tenantQuick = Math.max(tenantMin, Math.round(avgRent * (tenantPctRate / 100))) * tenantCount;
  const landlordQuick = (avgRentRoll * (mgmtFeePct / 100)) * (landlordPct / 100) * contractMonths * landlordCount;
  const investorQuick = investorMode === 'oneoff'
    ? avgInvestment * (investorOneOff / 100) * investorCount
    : avgInvestment * (investorYearly / 100) * investmentYears * investorCount;

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-700/50 overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center">
            <LucideIcons.Calculator className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span className="text-xs font-semibold text-slate-200">Earnings Simulator</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-emerald-400">{fmt(calc.grandTotal)}</span>
          <LucideIcons.ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded controls */}
      {open && (
        <div className="px-3 pb-3 border-t border-slate-700/50">
          {/* Quick chips */}
          <div className="flex gap-1.5 py-2 overflow-x-auto -mx-1 px-1 snap-x">
            {[
              ...(!hideTenant ? [{ icon: LucideIcons.UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Tenants', val: fmt(tenantQuick) }] : []),
              { icon: LucideIcons.Building2, color: 'text-indigo-400', bg: 'bg-indigo-500/10', label: 'Landlords', val: fmt(landlordQuick) },
              { icon: LucideIcons.TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Investors', val: fmt(investorQuick) },
            ].map((c) => (
              <div key={c.label} className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${c.bg} shrink-0 snap-start`}>
                <c.icon className={`w-3 h-3 ${c.color}`} />
                <span className="text-[11px] text-slate-300">{c.label}</span>
                <span className={`text-[11px] font-bold ${c.color} whitespace-nowrap`}>{c.val}</span>
              </div>
            ))}
          </div>

          {/* Sliders grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Tenant */}
            {!hideTenant && (
              <div className="space-y-1.5 bg-slate-800/40 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <LucideIcons.UserCheck className="w-3 h-3 text-emerald-400" />
                  <span className="text-[11px] font-bold text-emerald-400 uppercase">Tenants</span>
                  <span className="text-[10px] px-1 py-0 rounded bg-emerald-500/15 text-emerald-300 ml-auto">One-off</span>
                </div>
                <MINI_SLIDER label="Count" value={tenantCount} min={0} max={50} step={1} onChange={setTenantCount} accent="#34d399" />
                <MINI_SLIDER label="Rent" value={avgRent} min={5000} max={200000} step={1000} onChange={setAvgRent} format={fmt} accent="#34d399" />
                <div className="flex justify-between text-[11px] pt-0.5 border-t border-slate-700/40">
                  <span className="text-slate-400">Per tenant</span>
                  <span className="font-bold text-slate-200">{fmt(calc.tenantPer)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-emerald-400 font-semibold">Total</span>
                  <span className="font-bold text-emerald-300">{fmt(calc.tenantTotal)}</span>
                </div>
              </div>
            )}

            {/* Landlord */}
            <div className="space-y-1.5 bg-slate-800/40 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <LucideIcons.Building2 className="w-3 h-3 text-indigo-400" />
                <span className="text-[11px] font-bold text-indigo-400 uppercase">Landlords</span>
                <span className="text-[10px] px-1 py-0 rounded bg-indigo-500/15 text-indigo-300 ml-auto">Recurring</span>
              </div>
              <MINI_SLIDER label="Count" value={landlordCount} min={0} max={20} step={1} onChange={setLandlordCount} accent="#818cf8" />
              <MINI_SLIDER label="Rent Roll" value={avgRentRoll} min={50000} max={5000000} step={50000} onChange={setAvgRentRoll} format={fmt} accent="#818cf8" />
              <div className="grid grid-cols-2 gap-1.5">
                <MINI_SLIDER label="Fee%" value={mgmtFeePct} min={3} max={15} step={0.5} onChange={setMgmtFeePct} format={v => `${v}%`} accent="#818cf8" />
                <MINI_SLIDER label="Months" value={contractMonths} min={6} max={60} step={6} onChange={setContractMonths} accent="#818cf8" />
              </div>
              <div className="flex justify-between text-[11px] pt-0.5 border-t border-slate-700/40">
                <span className="text-slate-400">Monthly</span>
                <span className="font-bold text-slate-200">{fmt(calc.landlordMonthlyAll)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-indigo-400 font-semibold">Contract total</span>
                <span className="font-bold text-indigo-300">{fmt(calc.landlordTotal)}</span>
              </div>
            </div>

            {/* Investor */}
            <div className="space-y-1.5 bg-slate-800/40 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <LucideIcons.TrendingUp className="w-3 h-3 text-amber-400" />
                <span className="text-[11px] font-bold text-amber-400 uppercase">Investors</span>
                <div className="flex gap-0.5 ml-auto bg-slate-900/60 rounded p-0.5">
                  <button onClick={() => setInvestorMode('oneoff')} className={`text-[8px] font-bold px-1 rounded ${investorMode === 'oneoff' ? 'bg-amber-400 text-slate-900' : 'text-amber-300'}`}>{investorOneOff}%</button>
                  <button onClick={() => setInvestorMode('yearly')} className={`text-[8px] font-bold px-1 rounded ${investorMode === 'yearly' ? 'bg-amber-400 text-slate-900' : 'text-amber-300'}`}>{investorYearly}%/yr</button>
                </div>
              </div>
              <MINI_SLIDER label="Count" value={investorCount} min={0} max={30} step={1} onChange={setInvestorCount} accent="#fbbf24" />
              <MINI_SLIDER label="Investment" value={avgInvestment} min={10000} max={2000000} step={10000} onChange={setAvgInvestment} format={fmt} accent="#fbbf24" />
              {investorMode === 'yearly' && (
                <MINI_SLIDER label="Years" value={investmentYears} min={1} max={10} step={1} onChange={setInvestmentYears} accent="#fbbf24" />
              )}
              <div className="flex justify-between text-[11px] pt-0.5 border-t border-slate-700/40">
                <span className="text-slate-400">Per investor</span>
                <span className="font-bold text-slate-200">{fmt(calc.investorPer)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-amber-400 font-semibold">Total</span>
                <span className="font-bold text-amber-300">{fmt(calc.investorTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralCalculator;
