import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../api';
import { 
  Building2, 
  ChevronDown, 
  UserCheck, 
  PlusCircle, 
  CreditCard, 
  Play, 
  RefreshCw,
  ShieldCheck,
  CircleDot,
  Server
} from 'lucide-react';

export function Navbar({ onOpenDemo, onOpenNewCustomer, onOpenSettings }) {
  const { 
    customers, 
    selectedCustomerId, 
    selectedCustomer, 
    setSelectedCustomerId,
    accounts,
    selectedAccountId,
    selectedAccount,
    setSelectedAccountId,
    backendOnline,
    refreshCustomerData,
    isLoading
  } = useApp();

  const [customerDropdown, setCustomerDropdown] = useState(false);
  const [accountDropdown, setAccountDropdown] = useState(false);

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & System Tag */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Building2 className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white">PayBridge</span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Core Ledger
                </span>
              </div>
              <p className="text-xs text-slate-400">Modular Banking & Settlement Engine</p>
            </div>
          </div>

          {/* Center / Controls: Customer & Account switcher */}
          <div className="flex items-center gap-3">
            
            {/* Customer Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setCustomerDropdown(!customerDropdown);
                  setAccountDropdown(false);
                }}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-semibold">
                  {selectedCustomer ? `${selectedCustomer.firstName?.[0] || 'U'}` : '?'}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="font-medium text-slate-200 text-xs flex items-center gap-1.5">
                    {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : 'No Customer'}
                    {selectedCustomer && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300">
                        {selectedCustomer.kycTier}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                    {selectedCustomer?.email || 'Select or create'}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
              </button>

              {customerDropdown && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50">
                  <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 flex justify-between items-center">
                    <span>Tracked Customers</span>
                    <button
                      onClick={() => onOpenNewCustomer()}
                      className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1"
                    >
                      <PlusCircle className="w-3 h-3" /> New
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {customers.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-slate-500">
                        No customers saved yet.
                        <button
                          onClick={() => {
                            setCustomerDropdown(false);
                            onOpenNewCustomer();
                          }}
                          className="mt-2 block w-full text-center text-emerald-400 hover:underline"
                        >
                          Register First Customer
                        </button>
                      </div>
                    ) : (
                      customers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setCustomerDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs hover:bg-slate-800 transition ${
                            c.id === selectedCustomerId ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-white">
                              {c.firstName} {c.lastName}
                            </div>
                            <div className="text-[11px] text-slate-400">{c.email}</div>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {c.kycTier}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Account Switcher */}
            {accounts.length > 0 && (
              <div className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => {
                    setAccountDropdown(!accountDropdown);
                    setCustomerDropdown(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <div className="text-left">
                    <div className="mono font-semibold text-slate-100 text-xs">
                      {selectedAccount ? selectedAccount.accountNumber : 'Select Account'}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-medium">
                      {selectedAccount ? formatMoney(selectedAccount.balanceMinor, selectedAccount.currency) : '—'}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
                </button>

                {accountDropdown && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50">
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800/80">
                      Customer Accounts ({accounts.length})
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                      {accounts.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setSelectedAccountId(a.id);
                            setAccountDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs hover:bg-slate-800 transition ${
                            a.id === selectedAccountId ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="mono font-semibold text-white">{a.accountNumber}</div>
                            <div className="text-[11px] text-slate-400">{a.currency} • {a.status}</div>
                          </div>
                          <span className="mono font-semibold text-emerald-400">
                            {formatMoney(a.balanceMinor, a.currency)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Refresh button */}
            <button
              onClick={() => refreshCustomerData()}
              disabled={isLoading || !selectedCustomerId}
              title="Refresh Customer Data"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          {/* Right Actions: Demo Script Runner & Health Indicator */}
          <div className="flex items-center gap-3">
            {/* 1-Click Demo Tour Button */}
            <button
              onClick={() => onOpenDemo()}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-md shadow-emerald-600/30 transition active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Live Demo Guide</span>
            </button>

            {/* Backend Health Badge & Server Settings */}
            <button 
              type="button"
              onClick={() => onOpenSettings && onOpenSettings()}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition hover:opacity-80 ${
                backendOnline 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}
              title="Click to configure backend URL & Render connection"
            >
              <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="hidden sm:inline">{backendOnline ? 'Connected' : 'Backend Offline'}</span>
              <Server className="w-3 h-3 ml-0.5 opacity-60" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
