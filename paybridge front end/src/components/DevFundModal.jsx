import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, formatMoney, nairaToKobo } from '../api';
import { toast } from 'sonner';
import { Zap, X, ArrowDownLeft } from 'lucide-react';

const PRESETS = [
  { label: '₦1,000', amount: 1000 },
  { label: '₦3,000 (Demo Step 3)', amount: 3000 },
  { label: '₦10,000', amount: 10000 },
  { label: '₦50,000', amount: 50000 },
  { label: '₦200,000', amount: 200000 },
];

export function DevFundModal({ isOpen, onClose }) {
  const { selectedAccount, selectedCustomer, refreshCustomerData, refreshStatement } = useApp();
  const [customNaira, setCustomNaira] = useState('3000');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleFund = async (amountInNaira) => {
    if (!selectedAccount) {
      toast.error('Select an account to fund');
      return;
    }
    const amountMinor = nairaToKobo(amountInNaira);
    if (amountMinor <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }

    setLoading(true);
    try {
      const res = await api.fundAccount(selectedAccount.id, amountMinor);
      toast.success(`Account Funded with ${formatMoney(amountMinor)}`, {
        description: `New balance: ${formatMoney(res.balanceMinor)} • Double-entry credit from FUNDING_SOURCE.`,
      });
      await refreshCustomerData();
      await refreshStatement();
      onClose();
    } catch (err) {
      toast.error(`Funding Failed: ${err.code}`, {
        description: err.detail,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md panel-card p-6 shadow-2xl relative border border-slate-700 bg-slate-900">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-1">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Dev Account Funding</h3>
            <p className="text-xs text-slate-400">Test Scaffolding for local development</p>
          </div>
        </div>

        {/* Target Info */}
        <div className="my-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs">
          <div className="flex justify-between mb-1">
            <span className="text-slate-400">Target Customer:</span>
            <span className="font-semibold text-white">
              {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : '—'}
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-slate-400">Target NUBAN:</span>
            <span className="mono font-bold text-white">{selectedAccount?.accountNumber || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Current Balance:</span>
            <span className="mono font-bold text-emerald-400">
              {selectedAccount ? formatMoney(selectedAccount.balanceMinor, selectedAccount.currency) : '₦0.00'}
            </span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="space-y-2 mb-4">
          <label className="text-xs font-semibold text-slate-300 block">
            Select Preset Amount:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.amount}
                type="button"
                onClick={() => setCustomNaira(p.amount.toString())}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition border ${
                  customNaira === p.amount.toString()
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Input */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Or Custom Amount in Naira:
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">₦</span>
            <input
              type="number"
              min="1"
              value={customNaira}
              onChange={(e) => setCustomNaira(e.target.value)}
              placeholder="3000"
              className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white mono font-bold text-sm outline-none focus:border-amber-500"
            />
          </div>
          <span className="mono text-[11px] text-slate-400 mt-1 block">
            = {nairaToKobo(customNaira).toLocaleString()} kobo
          </span>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={() => handleFund(customNaira)}
          disabled={loading || !selectedAccount}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <ArrowDownLeft className="w-4 h-4" />
          {loading ? 'Posting Balanced Ledger Entry...' : `Inject ₦${Number(customNaira || 0).toLocaleString()} into Account`}
        </button>

        <p className="text-[11px] text-slate-500 mt-3 text-center">
          Posts debit from FUNDING_SOURCE and credit to this account. Enforces sum=0 trigger.
        </p>

      </div>
    </div>
  );
}
