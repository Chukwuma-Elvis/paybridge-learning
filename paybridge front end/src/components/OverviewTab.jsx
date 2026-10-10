import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatMoney, api } from '../api';
import { toast } from 'sonner';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  ShieldCheck, 
  Zap, 
  History, 
  CreditCard, 
  AlertTriangle,
  Plus,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

export function OverviewTab({ onNavigate, onOpenFundModal, onOpenNewAccountModal }) {
  const { 
    selectedCustomer, 
    selectedAccount, 
    limits, 
    statement, 
    refreshCustomerData,
    refreshStatement
  } = useApp();

  const [testingRefusal, setTestingRefusal] = useState(false);

  // Quick refusal tester
  const runRefusalTest = async (type) => {
    if (!selectedAccount) {
      toast.error('Select an active account first');
      return;
    }
    setTestingRefusal(true);
    try {
      if (type === 'overdraw') {
        // Try to transfer ₦40,000 from current balance
        await api.transferInternal({
          sourceAccountId: selectedAccount.id,
          destinationAccountNumber: '1000000024',
          amountMinor: 4000000,
          narration: 'Overdraw test'
        }, `test-overdraw-${Date.now()}`);
        toast.info('Transfer unexpectedly succeeded!');
      } else if (type === 'limit') {
        // Try to transfer ₦50,001 (exceeds UNVERIFIED ₦50,000 per-txn)
        await api.transferInternal({
          sourceAccountId: selectedAccount.id,
          destinationAccountNumber: '1000000024',
          amountMinor: 5000001,
          narration: 'Limit test'
        }, `test-limit-${Date.now()}`);
        toast.info('Transfer unexpectedly succeeded!');
      } else if (type === 'self') {
        // Try to transfer to same account
        await api.transferInternal({
          sourceAccountId: selectedAccount.id,
          destinationAccountNumber: selectedAccount.accountNumber,
          amountMinor: 10000,
          narration: 'Self transfer test'
        }, `test-self-${Date.now()}`);
        toast.info('Transfer unexpectedly succeeded!');
      }
    } catch (err) {
      toast.error(`Refusal Caught: ${err.code}`, {
        description: `${err.detail} (HTTP ${err.status})`,
      });
    } finally {
      setTestingRefusal(false);
    }
  };

  const balanceMinor = selectedAccount ? selectedAccount.balanceMinor : 0;
  const usedToday = limits ? limits.usedTodayMinor : 0;
  const dailyLimit = limits ? limits.dailyMinor : 10000000;
  const usedPct = dailyLimit > 0 ? Math.min(100, Math.round((usedToday / dailyLimit) * 100)) : 0;

  return (
    <div className="space-y-6">
      
      {/* Top 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card 1: Balance */}
        <div className="panel-card p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span className="flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-emerald-400" /> Current Balance
            </span>
            <span className="mono text-slate-300 font-bold">{selectedAccount?.currency || 'NGN'}</span>
          </div>

          <div className="text-3xl font-extrabold tracking-tight text-white mono mb-1">
            {formatMoney(balanceMinor, selectedAccount?.currency)}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80 mt-3">
            <span className="mono">
              NUBAN: <strong className="text-slate-200">{selectedAccount?.accountNumber || 'None'}</strong>
            </span>
            <button
              onClick={() => onOpenFundModal()}
              disabled={!selectedAccount}
              className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 hover:underline disabled:opacity-40"
            >
              <Zap className="w-3.5 h-3.5 fill-current" /> Top-Up Test Naira
            </button>
          </div>
        </div>

        {/* Card 2: Compliance & Daily Limit */}
        <div className="panel-card p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" /> Daily Compliance Usage
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold">
              {selectedCustomer?.kycTier || 'UNVERIFIED'}
            </span>
          </div>

          <div className="text-2xl font-bold tracking-tight text-white mono mb-2">
            {formatMoney(usedToday)} <span className="text-xs text-slate-400 font-normal">/ {formatMoney(dailyLimit)}</span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
            <div 
              className={`h-2 rounded-full transition-all duration-500 ${
                usedPct > 85 ? 'bg-rose-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${usedPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <span>{usedPct}% daily quota used</span>
            <button
              onClick={() => onNavigate('compliance')}
              className="text-sky-400 hover:text-sky-300 font-semibold hover:underline"
            >
              View Tier Limits
            </button>
          </div>
        </div>

        {/* Card 3: Customer Profile */}
        <div className="panel-card p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Customer Profile</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-semibold">
              {selectedCustomer?.status || 'ACTIVE'}
            </span>
          </div>

          <div className="text-lg font-bold text-white mb-0.5 truncate">
            {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : 'No Customer Selected'}
          </div>

          <div className="text-xs text-slate-400 mb-2 truncate">
            {selectedCustomer?.email || 'Please select or register a customer'}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80 mt-2">
            <span className="mono text-[11px] text-slate-400">{selectedCustomer?.phone || 'No Phone'}</span>
            <button
              onClick={() => onNavigate('customers')}
              className="text-emerald-400 hover:text-emerald-300 font-semibold hover:underline"
            >
              Manage KYC Tier
            </button>
          </div>
        </div>

      </div>

      {/* Quick Actions Panel */}
      <div className="panel-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Quick Banking Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigate('transfers', 'internal')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 hover:text-white transition group"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold">Internal Transfer</div>
              <div className="text-[11px] text-slate-400">PayBridge Account</div>
            </div>
          </button>

          <button
            onClick={() => onNavigate('transfers', 'external')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 hover:text-white transition group"
          >
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 group-hover:bg-sky-500/20">
              <ExternalLink className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold">External Transfer</div>
              <div className="text-[11px] text-slate-400">To Other Banks</div>
            </div>
          </button>

          <button
            onClick={() => onOpenFundModal()}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 hover:text-white transition group"
          >
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20">
              <Zap className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold">Dev Funding</div>
              <div className="text-[11px] text-slate-400">Test Scaffolding</div>
            </div>
          </button>

          <button
            onClick={() => onOpenNewAccountModal()}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 hover:text-white transition group"
          >
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20">
              <Plus className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold">Open New Account</div>
              <div className="text-[11px] text-slate-400">Assign New NUBAN</div>
            </div>
          </button>
        </div>
      </div>

      {/* Two columns: Recent Ledger Statements & Banking Safety Refusal Sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Statement Preview */}
        <div className="lg:col-span-2 panel-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Double-Entry Ledger Trail</h3>
              <p className="text-xs text-slate-400">Append-only immutable record for active account</p>
            </div>
            <button
              onClick={() => onNavigate('statement')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold hover:underline flex items-center gap-1"
            >
              View Full Statement ({statement.length})
            </button>
          </div>

          {statement.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No ledger entries yet. Fund the account or make a transfer to see journal entries.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Reference / Narration</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {statement.slice(0, 5).map((entry, idx) => {
                    const isCredit = entry.amountMinor > 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {isCredit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            {entry.entryType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-200">{entry.narration || 'Transfer movement'}</div>
                          <div className="mono text-[10px] text-slate-400 truncate max-w-[200px]">{entry.reference}</div>
                        </td>
                        <td className={`py-2.5 px-3 text-right mono font-bold ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isCredit ? '+' : ''}{formatMoney(entry.amountMinor, entry.currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400 mono text-[11px]">
                          {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Col: Instant Refusal Test Sandbox */}
        <div className="panel-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Safety & Refusals Sandbox</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Test the backend's double-entry invariant rules and strict compliance rejection.
          </p>

          <div className="space-y-2.5">
            <button
              onClick={() => runRefusalTest('overdraw')}
              disabled={testingRefusal || !selectedAccount}
              className="w-full text-left p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs transition disabled:opacity-40"
            >
              <div className="font-semibold text-rose-400 mb-0.5 flex items-center justify-between">
                <span>Attempt Overdraft (₦40,000)</span>
                <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10">422</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Throws <code className="text-slate-300">INSUFFICIENT_FUNDS</code>: database check prevents negative balance.
              </div>
            </button>

            <button
              onClick={() => runRefusalTest('limit')}
              disabled={testingRefusal || !selectedAccount}
              className="w-full text-left p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs transition disabled:opacity-40"
            >
              <div className="font-semibold text-amber-400 mb-0.5 flex items-center justify-between">
                <span>Exceed KYC Limit (₦50,001)</span>
                <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10">422</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Throws <code className="text-slate-300">LIMIT_EXCEEDED</code>: compliance rejects unverified tier limits.
              </div>
            </button>

            <button
              onClick={() => runRefusalTest('self')}
              disabled={testingRefusal || !selectedAccount}
              className="w-full text-left p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs transition disabled:opacity-40"
            >
              <div className="font-semibold text-sky-400 mb-0.5 flex items-center justify-between">
                <span>Transfer To Self</span>
                <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10">400</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Throws <code className="text-slate-300">VALIDATION_FAILED</code>: transfers to identical account forbidden.
              </div>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
