import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, formatMoney, nairaToKobo } from '../api';
import { toast } from 'sonner';
import { Zap, X, ArrowDownLeft, PlusCircle, AlertCircle, CreditCard } from 'lucide-react';

const PRESETS = [
  { label: '₦1,000', amount: 1000 },
  { label: '₦3,000 (Demo Step 3)', amount: 3000 },
  { label: '₦10,000', amount: 10000 },
  { label: '₦50,000', amount: 50000 },
  { label: '₦200,000', amount: 200000 },
];

export function DevFundModal({ isOpen, onClose }) {
  const { 
    selectedAccount, 
    selectedCustomer, 
    accounts, 
    selectedAccountId, 
    setSelectedAccountId,
    refreshCustomerData, 
    refreshStatement 
  } = useApp();
  
  const [customNaira, setCustomNaira] = useState('3000');
  const [loading, setLoading] = useState(false);
  const [isOpeningAccount, setIsOpeningAccount] = useState(false);

  if (!isOpen) return null;

  // Active target account to fund (selected or fallback to first available account)
  const targetAccount = selectedAccount || (accounts && accounts.length > 0 ? accounts[0] : null);

  const handleFund = async (amountInNaira) => {
    if (!targetAccount) {
      toast.error('No active account selected for funding');
      return;
    }
    const amountMinor = nairaToKobo(amountInNaira);
    if (amountMinor <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }

    setLoading(true);
    try {
      const res = await api.fundAccount(targetAccount.id, amountMinor);
      toast.success(`Account Funded with ${formatMoney(amountMinor)}`, {
        description: `New balance: ${formatMoney(res.balanceMinor)} • Double-entry credit from FUNDING_SOURCE.`,
      });
      await refreshCustomerData();
      await refreshStatement();
      onClose();
    } catch (err) {
      if (err.status === 404 || err.code === 'RESOURCE_NOT_FOUND') {
        toast.error('Account Not Found on Backend (404)', {
          description: 'This account does not exist on the active Render database. Please open a new account or clear cached accounts.',
        });
      } else {
        toast.error(`Funding Failed: ${err.code}`, {
          description: err.detail,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickOpenAccount = async () => {
    if (!selectedCustomer) {
      toast.error('Select a customer first');
      return;
    }
    setIsOpeningAccount(true);
    try {
      const created = await api.openAccount(selectedCustomer.id, 'NGN');
      toast.success(`Account Created: ${created.accountNumber}`, {
        description: 'Account is ready for dev funding.',
      });
      await refreshCustomerData(selectedCustomer.id);
      setSelectedAccountId(created.id);
    } catch (err) {
      toast.error('Could not open account', { description: err.detail });
    } finally {
      setIsOpeningAccount(false);
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
            <p className="text-xs text-slate-400">Test Scaffolding for local development & demonstration</p>
          </div>
        </div>

        {/* Target Info */}
        <div className="my-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Target Customer:</span>
            <span className="font-semibold text-white">
              {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : 'No Customer Selected'}
            </span>
          </div>

          {/* Account Selector if multiple exist */}
          {accounts && accounts.length > 1 ? (
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Select Target NUBAN:</span>
                <span className="mono text-[10px] text-amber-400">Multiple accounts found</span>
              </div>
              <select
                value={targetAccount?.id || ''}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white mono font-bold text-xs outline-none focus:border-amber-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber} ({formatMoney(a.balanceMinor, a.currency)})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Target NUBAN:</span>
              <span className="mono font-bold text-white">{targetAccount?.accountNumber || 'None'}</span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-slate-400">Current Balance:</span>
            <span className="mono font-bold text-emerald-400">
              {targetAccount ? formatMoney(targetAccount.balanceMinor, targetAccount.currency) : '₦0.00'}
            </span>
          </div>
        </div>

        {/* If customer has no accounts */}
        {selectedCustomer && (!accounts || accounts.length === 0) && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            <div className="flex items-center gap-2 mb-2 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>This customer has no active accounts yet</span>
            </div>
            <p className="text-[11px] text-slate-300 mb-2">
              Generate a CBN-compliant 10-digit NUBAN account first to receive test funding.
            </p>
            <button
              type="button"
              onClick={handleQuickOpenAccount}
              disabled={isOpeningAccount}
              className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {isOpeningAccount ? 'Generating NUBAN...' : `Generate NUBAN for ${selectedCustomer.firstName}`}
            </button>
          </div>
        )}

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
          disabled={loading || !targetAccount}
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
