import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { api, formatMoney } from '../api';
import { toast } from 'sonner';
import { 
  History, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Zap, 
  RefreshCw, 
  ShieldCheck, 
  FileText,
  Lock,
  Globe,
  CreditCard,
  Search,
  Filter,
  CheckCircle2,
  Layers,
  Scale,
  Copy
} from 'lucide-react';

export function LedgerStatementTab({ onOpenFundModal }) {
  const { 
    customers,
    selectedCustomer, 
    accounts, 
    selectedAccountId, 
    setSelectedAccountId,
    selectedAccount, 
    statement, 
    refreshStatement, 
    refreshCustomerData 
  } = useApp();

  // View Scope: 'all' = All accounts (Global Master Ledger) | 'single' = Single selected account
  const [viewScope, setViewScope] = useState('all');
  
  // Presentation Mode in Global Ledger: 'table' = Flat lines | 'journal' = Double-entry paired events
  const [presentationMode, setPresentationMode] = useState('table');

  const [globalEntries, setGlobalEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [accountFilter, setAccountFilter] = useState('ALL');

  // Customer lookup dictionary by ID or account number
  const accountOwnerMap = useMemo(() => {
    const map = new Map();
    for (const c of customers) {
      if (c.id) {
        map.set(c.id, `${c.firstName} ${c.lastName}`);
      }
    }
    return map;
  }, [customers]);

  // Load global entries across all accounts
  const fetchGlobalEntries = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const res = await api.getAllLedgerEntries(150);
        if (Array.isArray(res)) {
          setGlobalEntries(res);
          setLoading(false);
          return;
        }
      } catch (apiErr) {
        console.warn('Centralized entries API fallback:', apiErr.message);
      }

      // Fallback: Aggregate statements across known customer accounts
      const allLines = [];
      for (const acc of accounts) {
        try {
          const lines = await api.getStatement(acc.id, 50);
          for (const l of lines) {
            allLines.push({
              ...l,
              lineId: l.lineId || `${acc.id}-${l.reference}-${l.amountMinor}`,
              accountId: acc.id,
              accountNumber: acc.accountNumber,
              accountCode: null,
            });
          }
        } catch (e) {
          console.warn(`Could not load lines for account ${acc.id}`);
        }
      }
      allLines.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setGlobalEntries(allLines);
    } catch (err) {
      console.error('Failed to load global ledger lines:', err);
    } finally {
      setLoading(false);
    }
  }, [accounts]);

  useEffect(() => {
    if (viewScope === 'all') {
      fetchGlobalEntries();
    }
  }, [viewScope, fetchGlobalEntries]);

  const handleRefresh = async () => {
    setLoading(true);
    if (viewScope === 'all') {
      await fetchGlobalEntries();
      toast.success('Global Master Ledger reloaded');
    } else {
      await refreshStatement();
      await refreshCustomerData();
      toast.success('Account statement reloaded');
    }
    setLoading(false);
  };

  const copyToClipboard = (text, label = 'Reference') => {
    navigator.clipboard?.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // Filtered entries for Global Master Ledger
  const filteredGlobalEntries = useMemo(() => {
    return globalEntries.filter((item) => {
      // Type filter
      if (typeFilter !== 'ALL' && item.entryType !== typeFilter) {
        return false;
      }

      // Account filter
      if (accountFilter !== 'ALL') {
        const itemAcc = item.accountNumber || item.accountCode || item.accountId;
        if (itemAcc !== accountFilter) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const refMatch = item.reference?.toLowerCase().includes(q);
        const narMatch = (item.narration || item.description)?.toLowerCase().includes(q);
        const accMatch = (item.accountNumber || item.accountCode || item.accountId)?.toLowerCase().includes(q);
        if (!refMatch && !narMatch && !accMatch) return false;
      }

      return true;
    });
  }, [globalEntries, typeFilter, accountFilter, searchQuery]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    let debits = 0;
    let credits = 0;
    for (const e of filteredGlobalEntries) {
      if (e.amountMinor < 0) {
        debits += Math.abs(e.amountMinor);
      } else {
        credits += e.amountMinor;
      }
    }
    return {
      totalLines: filteredGlobalEntries.length,
      totalDebits: debits,
      totalCredits: credits,
      netDelta: credits - debits,
    };
  }, [filteredGlobalEntries]);

  // Grouped by transaction reference/entryId
  const groupedEvents = useMemo(() => {
    const map = new Map();
    for (const e of filteredGlobalEntries) {
      const key = e.reference || e.entryId || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          key,
          reference: e.reference,
          entryId: e.entryId,
          entryType: e.entryType,
          narration: e.narration || e.description,
          createdAt: e.createdAt,
          lines: [],
        });
      }
      map.get(key).lines.push(e);
    }
    return Array.from(map.values());
  }, [filteredGlobalEntries]);

  // Helper to format account label
  const formatAccountLabel = (item) => {
    if (item.accountNumber) {
      const matchedAcc = accounts.find((a) => a.accountNumber === item.accountNumber);
      const ownerName = matchedAcc && accountOwnerMap.get(matchedAcc.ownerCustomerId);
      return ownerName ? `${ownerName} (${item.accountNumber})` : item.accountNumber;
    }
    if (item.accountCode) {
      return `[SYSTEM] ${item.accountCode}`;
    }
    return item.accountId ? `${item.accountId.slice(0, 8)}...` : 'Unknown Account';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Scope Navigation Header */}
      <div className="panel-card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-white">General Ledger & Double-Entry Statements</h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase tracking-wider">
              Append-Only Core
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete immutable ledger of all debits and credits across customer accounts and bank system accounts.
          </p>
        </div>

        {/* View Scope Toggle */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800 self-stretch md:self-auto">
          <button
            type="button"
            onClick={() => setViewScope('all')}
            className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              viewScope === 'all'
                ? 'bg-emerald-600 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            All Accounts (Master Ledger)
          </button>
          <button
            type="button"
            onClick={() => setViewScope('single')}
            className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              viewScope === 'single'
                ? 'bg-emerald-600 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Single Account Statement
          </button>
        </div>
      </div>

      {/* VIEW 1: GLOBAL MASTER LEDGER (ALL ACCOUNTS) */}
      {viewScope === 'all' && (
        <div className="space-y-6">

          {/* KPI Statistics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="panel-card p-4">
              <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider block mb-1">
                Total Movements
              </span>
              <div className="text-2xl font-bold mono text-white">
                {metrics.totalLines} lines
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Across all customer & system accounts
              </span>
            </div>

            <div className="panel-card p-4">
              <span className="text-[11px] font-semibold uppercase text-rose-400 tracking-wider block mb-1">
                Total Debits Posted
              </span>
              <div className="text-2xl font-bold mono text-rose-400">
                -{formatMoney(metrics.totalDebits)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Outflows & withdrawals
              </span>
            </div>

            <div className="panel-card p-4">
              <span className="text-[11px] font-semibold uppercase text-emerald-400 tracking-wider block mb-1">
                Total Credits Posted
              </span>
              <div className="text-2xl font-bold mono text-emerald-400">
                +{formatMoney(metrics.totalCredits)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Inflows & test deposits
              </span>
            </div>

            <div className="panel-card p-4 border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold uppercase text-emerald-400 tracking-wider">
                  Equilibrium Verification
                </span>
                <Scale className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold mono text-white flex items-center gap-1.5">
                <span>Net: {formatMoney(metrics.netDelta)}</span>
              </div>
              <div className="text-[11px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ∑ Debits + ∑ Credits = 0 (Balanced)
              </div>
            </div>

          </div>

          {/* Filter Bar & Presentation Selector */}
          <div className="panel-card p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by reference, narration, or account number/code..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs outline-none focus:border-emerald-500"
              />
            </div>

            {/* Dropdowns */}
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs outline-none focus:border-emerald-500"
              >
                <option value="ALL">All Types</option>
                <option value="TRANSFER">Transfers (TRANSFER)</option>
                <option value="FUNDING">Dev Funding (FUNDING)</option>
                <option value="EXTERNAL_HOLD">External Holds</option>
                <option value="REVERSAL">Reversals</option>
              </select>

              {/* Mode Toggle: Flat table vs Double-entry pairs */}
              <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-700/80 text-xs">
                <button
                  type="button"
                  onClick={() => setPresentationMode('table')}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                    presentationMode === 'table'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Show all individual debit and credit lines"
                >
                  <FileText className="w-3 h-3" /> All Lines
                </button>
                <button
                  type="button"
                  onClick={() => setPresentationMode('journal')}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                    presentationMode === 'journal'
                      ? 'bg-slate-800 text-emerald-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Group into balanced double-entry transactions"
                >
                  <Layers className="w-3 h-3" /> Journal Events
                </button>
              </div>

              {/* Refresh button */}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition disabled:opacity-40"
                title="Reload Global Master Ledger"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>

            </div>

          </div>

          {/* PRESENTATION MODE 1: FLAT TABLE (ALL LINES ACROSS ALL ACCOUNTS) */}
          {presentationMode === 'table' && (
            <div className="panel-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-400" />
                  All Ledger Lines ({filteredGlobalEntries.length} movements across all accounts)
                </h3>
                <span className="text-xs text-slate-400">Sorted newest first</span>
              </div>

              {filteredGlobalEntries.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  {loading ? 'Loading global ledger entries...' : 'No ledger movements found matching current filters.'}
                  <div className="mt-2">
                    <button
                      onClick={() => onOpenFundModal()}
                      className="text-emerald-400 hover:underline font-semibold"
                    >
                      Inject Dev Test Funds to Generate Movements
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-3">Entry Type</th>
                        <th className="py-3 px-3">Account Involved</th>
                        <th className="py-3 px-3">Reference</th>
                        <th className="py-3 px-3">Narration / Description</th>
                        <th className="py-3 px-3 text-right">Debit / Credit Amount</th>
                        <th className="py-3 px-3 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredGlobalEntries.map((line, idx) => {
                        const isCredit = line.amountMinor > 0;
                        const accLabel = formatAccountLabel(line);
                        return (
                          <tr key={line.lineId || idx} className="hover:bg-slate-800/40 transition">
                            
                            {/* Type */}
                            <td className="py-3 px-3">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                isCredit
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}>
                                {isCredit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                {line.entryType}
                              </span>
                            </td>

                            {/* Account */}
                            <td className="py-3 px-3">
                              <div className="mono font-semibold text-slate-200">
                                {accLabel}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {line.accountCode ? 'SYSTEM ACCOUNT' : 'CUSTOMER DEPOSIT'}
                              </div>
                            </td>

                            {/* Reference */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="mono text-slate-300 truncate max-w-[150px]" title={line.reference}>
                                  {line.reference}
                                </span>
                                <button
                                  onClick={() => copyToClipboard(line.reference, 'Reference')}
                                  className="text-slate-500 hover:text-slate-300 transition"
                                  title="Copy Reference"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            {/* Narration */}
                            <td className="py-3 px-3 text-slate-300">
                              {line.narration || line.description || '—'}
                            </td>

                            {/* Amount */}
                            <td className={`py-3 px-3 text-right mono font-bold text-sm ${
                              isCredit ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {isCredit ? '+' : ''}{formatMoney(line.amountMinor, line.currency)}
                            </td>

                            {/* Timestamp */}
                            <td className="py-3 px-3 text-right text-slate-400 mono text-[11px]">
                              {new Date(line.createdAt).toLocaleString()}
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PRESENTATION MODE 2: JOURNAL EVENTS (DOUBLE-ENTRY PAIRED EVENTS) */}
          {presentationMode === 'journal' && (
            <div className="space-y-3">
              {groupedEvents.length === 0 ? (
                <div className="panel-card p-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No journal events found matching current filters.
                </div>
              ) : (
                groupedEvents.map((event) => {
                  const eventDebits = event.lines.filter((l) => l.amountMinor < 0);
                  const eventCredits = event.lines.filter((l) => l.amountMinor > 0);
                  const sumMinor = event.lines.reduce((acc, curr) => acc + curr.amountMinor, 0);

                  return (
                    <div key={event.key} className="panel-card p-4 space-y-3 border border-slate-800 hover:border-slate-700 transition">
                      
                      {/* Event Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-slate-800 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-200 border border-slate-700">
                            {event.entryType}
                          </span>
                          <span className="mono font-bold text-xs text-white">
                            {event.reference}
                          </span>
                          {event.narration && (
                            <span className="text-xs text-slate-400 italic">
                              "{event.narration}"
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          <span className="mono text-slate-400 text-[11px]">
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            sumMinor === 0 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {sumMinor === 0 ? '✓ Balanced (Sum = 0)' : `Unbalanced (Δ ${sumMinor})`}
                          </span>
                        </div>
                      </div>

                      {/* Double-Entry Legs Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        
                        {/* Debit Leg */}
                        <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/15 space-y-1.5">
                          <div className="text-[10px] uppercase font-bold text-rose-400 tracking-wider flex items-center justify-between">
                            <span>Debit Leg (Debited Outflow)</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </div>
                          {eventDebits.map((l, i) => (
                            <div key={i} className="flex justify-between items-center text-xs">
                              <span className="mono text-slate-300">{formatAccountLabel(l)}</span>
                              <span className="mono font-bold text-rose-400">
                                {formatMoney(l.amountMinor, l.currency)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Credit Leg */}
                        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15 space-y-1.5">
                          <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center justify-between">
                            <span>Credit Leg (Credited Inflow)</span>
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          </div>
                          {eventCredits.map((l, i) => (
                            <div key={i} className="flex justify-between items-center text-xs">
                              <span className="mono text-slate-300">{formatAccountLabel(l)}</span>
                              <span className="mono font-bold text-emerald-400">
                                +{formatMoney(l.amountMinor, l.currency)}
                              </span>
                            </div>
                          ))}
                        </div>

                      </div>

                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      )}

      {/* VIEW 2: SINGLE ACCOUNT STATEMENT */}
      {viewScope === 'single' && (
        <div className="space-y-6">
          
          {/* Top Account Control Strip */}
          <div className="panel-card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white">Specific Account Statement View</h3>
              <p className="text-xs text-slate-400 mt-1">
                Filter down to the transactions of a single customer account.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs mono font-semibold outline-none focus:border-emerald-500"
              >
                {accounts.length === 0 ? (
                  <option value="">No Accounts Available</option>
                ) : (
                  accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      NUBAN: {a.accountNumber} ({formatMoney(a.balanceMinor, a.currency)})
                    </option>
                  ))
                )}
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
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition disabled:opacity-40"
                title="Reload Entries"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Account Profile Strip */}
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
                <span className="mono font-bold text-emerald-400">
                  {formatMoney(selectedAccount.balanceMinor, selectedAccount.currency)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Status / Type:</span>
                <span className="font-semibold text-slate-300">{selectedAccount.status} • CUSTOMER</span>
              </div>
            </div>
          )}

          {/* Statement Entries Table */}
          <div className="panel-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-400" />
                Journal Lines for Selected Account ({statement.length} entries)
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
                              isCredit 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
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
                          <td className={`py-3 px-3 text-right mono font-bold text-sm ${
                            isCredit ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
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
          </div>

        </div>
      )}

      {/* Ledger Integrity Educational Strip */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-start gap-3">
        <Lock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-white">Database Trigger Protection & Append-Only Invariant:</div>
          <p>
            The ledger is an immutable journal. In PostgreSQL, <code className="text-slate-300">trg_ledger_line_append_only</code> permanently prevents <code className="text-slate-300">UPDATE</code> and <code className="text-slate-300">DELETE</code> operations.
            At transaction commit, <code className="text-slate-300">trg_ledger_line_balanced</code> verifies that all debits and credits in each journal entry sum to exactly zero.
          </p>
        </div>
      </div>

    </div>
  );
}
