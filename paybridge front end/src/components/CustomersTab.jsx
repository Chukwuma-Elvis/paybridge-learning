import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, formatMoney } from '../api';
import { toast } from 'sonner';
import { 
  Users, 
  UserPlus, 
  CreditCard, 
  ShieldCheck, 
  Plus, 
  CheckCircle2, 
  Sparkles,
  Phone,
  Mail,
  User,
  Trash2
} from 'lucide-react';

export function CustomersTab() {
  const { 
    customers, 
    selectedCustomerId, 
    setSelectedCustomerId, 
    selectedCustomer,
    accounts,
    accountsLoadFailed,
    addOrUpdateCustomer,
    refreshCustomerData,
    clearStoredData
  } = useApp();

  // Find an existing customer by id (customers are only remembered in this browser, so this gets them back)
  const [lookupId, setLookupId] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);

  const handleLookup = async (e) => {
    e.preventDefault();
    const id = lookupId.trim();
    if (!id) {
      toast.error('Paste a customer id first');
      return;
    }
    setIsLookingUp(true);
    try {
      const found = await api.getCustomer(id);
      addOrUpdateCustomer(found);
      setLookupId('');
      toast.success(`Found ${found.firstName} ${found.lastName}`, {
        description: 'Their accounts are loading now.',
      });
    } catch (err) {
      toast.error('Customer not found', {
        description: err.status === 404 ? 'No customer has that id.' : err.detail,
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const copyCustomerId = async () => {
    try {
      await navigator.clipboard.writeText(selectedCustomerId);
      toast.success('Customer id copied', { description: 'Keep it: you can use it to find this customer later.' });
    } catch {
      toast.error('Could not copy', { description: selectedCustomerId });
    }
  };

  // New Customer Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // Open Account State
  const [isOpeningAccount, setIsOpeningAccount] = useState(false);

  // KYC Tier State
  const [isUpdatingKyc, setIsUpdatingKyc] = useState(false);

  // Fast pre-fill helper
  const fillSample = (name) => {
    const rand = Math.floor(1000 + Math.random() * 9000);
    if (name === 'ada') {
      setFirstName('Ada');
      setLastName('Obi');
      setEmail(`ada${rand}@example.com`);
      setPhone('08012345678');
    } else {
      setFirstName('Bola');
      setLastName('Eze');
      setEmail(`bola${rand}@example.com`);
      setPhone('08098765432');
    }
  };

  // Create Customer
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !phone) {
      toast.error('All fields are required');
      return;
    }
    setIsCreatingCustomer(true);
    try {
      const created = await api.createCustomer({
        firstName,
        lastName,
        email,
        phone,
      });

      addOrUpdateCustomer(created);
      toast.success(`Customer Created: ${created.firstName} ${created.lastName}`, {
        description: `ID: ${created.id} • Normalised phone: ${created.phone}`,
      });

      // Automatically open their first account
      try {
        const opened = await api.openAccount(created.id, 'NGN');
        toast.success(`Account Opened: ${opened.accountNumber}`, {
          description: 'NUBAN generated with check-digit. Starting balance: ₦0.00',
        });
        refreshCustomerData(created.id);
      } catch (accErr) {
        toast.error('Could not auto-open account', { description: accErr.detail });
      }

      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
    } catch (err) {
      toast.error(`Customer Creation Failed: ${err.code}`, {
        description: err.detail,
      });
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // Open additional account for current customer
  const handleOpenAccount = async () => {
    if (!selectedCustomerId) {
      toast.error('Select a customer first');
      return;
    }
    setIsOpeningAccount(true);
    try {
      const opened = await api.openAccount(selectedCustomerId, 'NGN');
      toast.success(`New Account Opened: ${opened.accountNumber}`, {
        description: `NUBAN generated with check-digit algorithm.`,
      });
      refreshCustomerData();
    } catch (err) {
      toast.error('Failed to open account', { description: err.detail });
    } finally {
      setIsOpeningAccount(false);
    }
  };

  // Update KYC Tier
  const handleUpdateKyc = async (newTier) => {
    if (!selectedCustomerId) return;
    setIsUpdatingKyc(true);
    try {
      const updated = await api.updateKycTier(selectedCustomerId, newTier);
      addOrUpdateCustomer(updated);
      toast.success(`KYC Tier Updated to ${newTier}`, {
        description: `Transfer limits automatically updated in compliance engine.`,
      });
      refreshCustomerData();
    } catch (err) {
      toast.error('Failed to update KYC tier', { description: err.detail });
    } finally {
      setIsUpdatingKyc(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Find an existing customer by id */}
      <form onSubmit={handleLookup} className="panel-card p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Find an existing customer by ID
          </label>
          <input
            type="text"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="Paste a customer id, e.g. 9acd..."
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs mono outline-none focus:border-emerald-500"
          />
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Customers are remembered only in this browser. If they are missing here, paste the id you saved.
          </span>
        </div>
        <button
          type="submit"
          disabled={isLookingUp}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition disabled:opacity-40"
        >
          {isLookingUp ? 'Looking up...' : 'Find customer'}
        </button>
      </form>

      {/* Top Split: Create Customer & Active Customer Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Form: Register Customer */}
        <div className="panel-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                Register New Customer
              </h3>
              <p className="text-xs text-slate-400">
                Customers start as UNVERIFIED and ACTIVE with a UUID.
              </p>
            </div>
            
            {/* Quick Demo Pre-fills */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fillSample('ada')}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-emerald-400 font-semibold transition"
              >
                + Fill Ada
              </button>
              <button
                type="button"
                onClick={() => fillSample('bola')}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-sky-400 font-semibold transition"
              >
                + Fill Bola
              </button>
            </div>
          </div>

          <form onSubmit={handleCreateCustomer} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ada"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Obi"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ada@example.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] text-slate-500 block mt-0.5">Enforced unique in database</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08012345678"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] text-slate-500 block mt-0.5">Auto-normalised to +234 format</span>
            </div>

            <button
              type="submit"
              disabled={isCreatingCustomer}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <UserPlus className="w-4 h-4 fill-current" />
              {isCreatingCustomer ? 'Registering...' : 'Register Customer & Open NUBAN'}
            </button>
          </form>
        </div>

        {/* Selected Customer Details & KYC Controls */}
        <div className="panel-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-400" />
                Active Customer Profile & KYC
              </h3>
              <p className="text-xs text-slate-400">
                Manage compliance verification level and accounts.
              </p>
            </div>
            {selectedCustomer && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                {selectedCustomer.status}
              </span>
            )}
          </div>

          {selectedCustomer ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400">Customer Name:</span>
                  <span className="text-white font-bold text-sm">
                    {selectedCustomer.firstName} {selectedCustomer.lastName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-slate-200">{selectedCustomer.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Phone:</span>
                  <span className="mono text-slate-200">{selectedCustomer.phone}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Customer ID:</span>
                  <span className="flex items-center gap-2">
                    <span className="mono text-[11px] text-slate-400 truncate max-w-[180px]" title={selectedCustomer.id}>{selectedCustomer.id}</span>
                    <button
                      type="button"
                      onClick={copyCustomerId}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-sky-400 font-semibold transition"
                    >
                      Copy ID
                    </button>
                  </span>
                </div>
              </div>

              {/* KYC Tier Upgrade Actions */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Change KYC Verification Tier:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['UNVERIFIED', 'BASIC', 'FULL'].map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => handleUpdateKyc(tier)}
                      disabled={isUpdatingKyc || selectedCustomer.kycTier === tier}
                      className={`py-2 px-2.5 rounded-lg text-xs font-bold transition border ${
                        selectedCustomer.kycTier === tier
                          ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Higher tiers grant increased daily transaction and cumulative sending limits.
                </p>
              </div>

              {/* Open Account Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleOpenAccount}
                  disabled={isOpeningAccount}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 text-purple-400" />
                  {isOpeningAccount ? 'Opening Account...' : 'Open Another Customer Account (Generate NUBAN)'}
                </button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No customer selected. Choose a customer from the top menu or register one on the left.
            </div>
          )}
        </div>

      </div>

      {/* Customer Accounts Table */}
      <div className="panel-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-800 gap-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            Accounts Belonging to {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : 'Customer'} ({accounts.length})
          </h3>

          <button
            type="button"
            onClick={() => {
              if (window.confirm('Are you sure you want to clear all created bank accounts, customers, and test ledger entries?')) {
                clearStoredData(true);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition flex items-center gap-1.5 self-start sm:self-auto"
            title="Permanently wipes all customer accounts and resets system to fresh state"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear All Bank Accounts
          </button>
        </div>

        {accounts.length === 0 && accountsLoadFailed ? (
          <div className="py-8 text-center text-xs text-amber-400 border border-dashed border-amber-500/30 rounded-xl">
            Could not load the accounts yet. The backend may be waking up (the free server sleeps when idle), so this
            page keeps retrying automatically. Your accounts are safe in the database.
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No accounts open for this customer yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Account Number (NUBAN)</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Currency</th>
                  <th className="py-2.5 px-3 text-right">Balance</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 mono font-bold text-white text-sm">
                      {acc.accountNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">CUSTOMER</td>
                    <td className="py-2.5 px-3 mono text-slate-300">{acc.currency}</td>
                    <td className="py-2.5 px-3 text-right mono font-bold text-emerald-400 text-sm">
                      {formatMoney(acc.balanceMinor, acc.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                        {acc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
