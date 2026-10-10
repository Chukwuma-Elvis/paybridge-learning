import React from 'react';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../api';
import { ShieldCheck, AlertCircle, ArrowUpRight } from 'lucide-react';

const TIERS_SPEC = [
  {
    tier: 'UNVERIFIED',
    perTxnMinor: 5000000, // ₦50,000
    dailyMinor: 10000000, // ₦100,000
    description: 'Default tier on customer registration. Suitable for low-value transfers.',
  },
  {
    tier: 'BASIC',
    perTxnMinor: 20000000, // ₦200,000
    dailyMinor: 50000000, // ₦500,000
    description: 'Verified with BVN or national identity. Standard retail banking tier.',
  },
  {
    tier: 'FULL',
    perTxnMinor: 500000000, // ₦5,000,000
    dailyMinor: 1000000000, // ₦10,000,000
    description: 'Fully verified high-volume account with address verification.',
  },
];

export function ComplianceTab({ onNavigate }) {
  const { selectedCustomer, limits } = useApp();

  const usedToday = limits ? limits.usedTodayMinor : 0;
  const dailyLimit = limits ? limits.dailyMinor : 10000000;
  const usedPct = dailyLimit > 0 ? Math.min(100, Math.round((usedToday / dailyLimit) * 100)) : 0;

  return (
    <div className="space-y-6">
      
      {/* Top Card: Active Customer Limit Status */}
      <div className="panel-card p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-sky-400" />
              <h2 className="text-base font-bold text-white">
                Compliance & KYC Limits Status
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Limits are enforced atomically using single-row PostgreSQL reservation upserts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Current KYC Tier:</span>
            <span className="text-xs px-2.5 py-1 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 font-bold">
              {selectedCustomer?.kycTier || 'UNVERIFIED'}
            </span>
          </div>
        </div>

        {/* Progress Display */}
        <div className="mt-5 space-y-3">
          <div className="flex justify-between items-end">
            <div>
              <span className="text-xs text-slate-400 block mb-1">Today's Cumulative Usage</span>
              <span className="text-2xl font-bold mono text-white">{formatMoney(usedToday)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block mb-1">Daily Cap</span>
              <span className="text-sm font-semibold mono text-slate-300">{formatMoney(dailyLimit)}</span>
            </div>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                usedPct > 85 ? 'bg-rose-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${usedPct}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>{usedPct}% consumed today</span>
            <span>Remaining: <strong className="mono text-emerald-400">{formatMoney(Math.max(0, dailyLimit - usedToday))}</strong></span>
          </div>
        </div>
      </div>

      {/* Tier Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TIERS_SPEC.map((spec) => {
          const isCurrent = selectedCustomer?.kycTier === spec.tier;
          return (
            <div
              key={spec.tier}
              className={`panel-card p-5 relative transition ${
                isCurrent ? 'border-sky-500/80 bg-slate-900/90 ring-1 ring-sky-500/30' : ''
              }`}
            >
              {isCurrent && (
                <span className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full bg-sky-500 text-slate-950 font-extrabold uppercase">
                  Active
                </span>
              )}

              <h3 className="text-sm font-bold text-white mb-1">{spec.tier}</h3>
              <p className="text-[11px] text-slate-400 mb-4">{spec.description}</p>

              <div className="space-y-2 text-xs pt-3 border-t border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Per Transfer:</span>
                  <span className="mono font-bold text-white">{formatMoney(spec.perTxnMinor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Daily Total:</span>
                  <span className="mono font-bold text-sky-400">{formatMoney(spec.dailyMinor)}</span>
                </div>
              </div>

              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => onNavigate('customers')}
                  className="mt-4 w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                >
                  Switch to {spec.tier}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Compliance Architecture Explanation */}
      <div className="panel-card p-5 text-xs text-slate-400 space-y-2">
        <h4 className="font-semibold text-white flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-sky-400" />
          How PayBridge Enforces Limits Atomically
        </h4>
        <p>
          Unlike naive implementations that read a daily total and then perform a subsequent update (prone to concurrency race conditions), PayBridge uses <strong>single SQL upsert statements</strong> against the <code className="text-slate-300">daily_usage</code> table.
        </p>
        <p>
          If 20 transfers hit the system at the same millisecond, Postgres serializes the updates and rejects any transfer that would exceed the daily cap with an HTTP 422 <code className="text-slate-300">LIMIT_EXCEEDED</code> exception.
        </p>
      </div>

    </div>
  );
}
