import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, formatMoney, nairaToKobo } from '../api';
import { toast } from 'sonner';
import { 
  History, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Zap, 
  RefreshCw, 
  ShieldCheck, 
  FileText,
  Lock
} from 'lucide-react';

export function LedgerStatementTab({ onOpenFundModal }) {
  const { 
    selectedCustomer, 
    accounts, 
    selectedAccountId, 
    setSelectedAccountId,
    selectedAccount, 
    statement, 
    refreshStatement, 
    refreshCustomerData 
  } = useApp();

  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    await refreshStatement();
    await refreshCustomerData();
    setLoading(false);
    toast.success('Ledger statement reloaded');
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="panel-card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">Double-Entry Account Statement</h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase">
              Append-Only
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Every movement is an immutable journal line. Balances are derived from double-entry records.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Account selector */}
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs mono font-semibold outline-none focus:border-emerald-500"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                NUBAN: {a.accountNumber} ({formatMoney(a.balanceMinor, a.currency)})
              </option>
            ))}
          </select>

          <button
            onClick={() => onOpenFundModal()}
            disabled={!selectedAccount}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
          >
            <Zap className="w-3.5 h-3.5 fill-current" /> Dev Fund Account
          </button>

          <button
            onClick={handleRefresh}
            disabled={loading || !selectedAccountId}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
            title="Reload Entries"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Account Info Strip */}
      {selectedAccount && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Account Holder:</span>
            <span className="font-bold text-white">
              {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Account Number (NUBAN):</span>
            <span className="mono font-bold text-white">{selectedAccount.accountNumber}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Current Cached Balance:</span>
            <span className="mono font-bold text-emerald-400">{formatMoney(selectedAccount.balanceMinor, selectedAccount.currency)}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Status / Type:</span>
            <span className="font-semibold text-slate-300">{selectedAccount.status} • CUSTOMER</span>
          </div>
        </div>
      )}

      {/* Entries Table */}
      <div className="panel-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            Journal Lines History ({statement.length} entries)
          </h3>
          <span className="text-xs text-slate-400">Sorted newest first</span>
        </div>

        {statement.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No money movements found on this account yet.
            <div className="mt-2">
              <button
                onClick={() => onOpenFundModal()}
                className="text-emerald-400 hover:underline font-semibold"
              >
                Inject Dev Test Funds
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Entry Type</th>
                  <th className="py-3 px-3">Reference</th>
                  <th className="py-3 px-3">Narration</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {statement.map((entry, idx) => {
                  const isCredit = entry.amountMinor > 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          isCredit ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {isCredit ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                          {entry.entryType}
                        </span>
                      </td>
                      <td className="py-3 px-3 mono text-slate-200">
                        {entry.reference}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {entry.narration || '—'}
                      </td>
                      <td className={`py-3 px-3 text-right mono font-bold text-sm ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isCredit ? '+' : ''}{formatMoney(entry.amountMinor, entry.currency)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-400 mono text-[11px]">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Ledger Integrity Note */}
        <div className="mt-6 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-start gap-3">
          <Lock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-white">Database Trigger Protection:</div>
            <p>
              The ledger table has an append-only trigger: <code className="text-slate-300">UPDATE on ledger_line is not allowed</code>.
              Even database administrators cannot tamper with transaction histories. At commit, Postgres checks that all lines in each journal entry sum to exactly zero.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
