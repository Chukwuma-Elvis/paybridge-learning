import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api, formatMoney, nairaToKobo, generateIdempotencyKey } from '../api';
import { toast } from 'sonner';
import { 
  ArrowUpRight, 
  Send, 
  RotateCw, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ShieldAlert, 
  UserPlus, 
  Building,
  Info,
  HelpCircle,
  Sparkles
} from 'lucide-react';

const NIGERIAN_BANKS = [
  { code: '999', name: '999 - PayBridge Test Bank' },
  { code: '058', name: '058 - GTBank (Guaranty Trust)' },
  { code: '044', name: '044 - Access Bank' },
  { code: '011', name: '011 - First Bank of Nigeria' },
  { code: '057', name: '057 - Zenith Bank' },
  { code: '033', name: '033 - United Bank for Africa (UBA)' },
  { code: '214', name: '214 - First City Monument Bank (FCMB)' },
  { code: '035', name: '035 - Wema Bank (ALAT)' },
  { code: '050', name: '050 - Ecobank Nigeria' },
  { code: '070', name: '070 - Fidelity Bank' },
];

export function TransfersTab({ defaultSubTab = 'internal' }) {
  const { 
    selectedCustomer, 
    accounts, 
    selectedAccountId, 
    selectedAccount,
    refreshCustomerData,
    refreshStatement
  } = useApp();

  const [subTab, setSubTab] = useState(defaultSubTab);

  // --- Internal Transfer State ---
  const [destNuban, setDestNuban] = useState('');
  const [resolvedDestAccount, setResolvedDestAccount] = useState(null);
  const [isVerifyingNuban, setIsVerifyingNuban] = useState(false);
  const [internalAmountNaira, setInternalAmountNaira] = useState('500');
  const [internalNarration, setInternalNarration] = useState('rent');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey('trans'));
  const [isSubmittingInternal, setIsSubmittingInternal] = useState(false);
  const [lastTransferResult, setLastTransferResult] = useState(null);

  // --- External Transfer State ---
  const [extBankCode, setExtBankCode] = useState('999');
  const [extAccountNumber, setExtAccountNumber] = useState('0123453333');
  const [resolvingExternal, setResolvingExternal] = useState(false);
  const [resolvedExternalBeneficiary, setResolvedExternalBeneficiary] = useState(null);
  const [savedBeneficiaries, setSavedBeneficiaries] = useState([]);
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState('');
  const [savingBeneficiary, setSavingBeneficiary] = useState(false);
  const [extAmountNaira, setExtAmountNaira] = useState('1000');
  const [extNarration, setExtNarration] = useState('invoice 1024');
  const [extIdempotencyKey, setExtIdempotencyKey] = useState(() => generateIdempotencyKey('ext'));
  const [isSubmittingExternal, setIsSubmittingExternal] = useState(false);
  const [activeExternalTransfer, setActiveExternalTransfer] = useState(null);
  const [isPollingExternal, setIsPollingExternal] = useState(false);

  // Load saved beneficiaries
  useEffect(() => {
    if (selectedCustomer?.id) {
      api.listBeneficiaries(selectedCustomer.id)
        .then((b) => setSavedBeneficiaries(b || []))
        .catch(() => {});
    }
  }, [selectedCustomer?.id]);

  // Lookup destination account when 10 digits are typed
  const handleVerifyNuban = async (numberToVerify) => {
    const num = numberToVerify || destNuban;
    if (!num || num.length !== 10) {
      toast.error('Enter a valid 10-digit NUBAN');
      return;
    }
    setIsVerifyingNuban(true);
    setResolvedDestAccount(null);
    try {
      const acc = await api.getAccountByNumber(num);
      setResolvedDestAccount(acc);
      toast.success(`Found Account: ${acc.accountNumber} (${acc.currency})`);
    } catch (err) {
      toast.error('Account not found', { description: err.detail || 'No PayBridge account with this NUBAN' });
    } finally {
      setIsVerifyingNuban(false);
    }
  };

  // Submit Internal Transfer
  const handleSendInternal = async (isReplayAttempt = false) => {
    if (!selectedAccount) {
      toast.error('Please select an active source account');
      return;
    }
    if (!destNuban || destNuban.length !== 10) {
      toast.error('Recipient account number must be 10 digits');
      return;
    }
    const amountMinor = nairaToKobo(internalAmountNaira);
    if (amountMinor <= 0) {
      toast.error('Transfer amount must be greater than ₦0');
      return;
    }

    setIsSubmittingInternal(true);
    try {
      const result = await api.transferInternal({
        sourceAccountId: selectedAccount.id,
        destinationAccountNumber: destNuban,
        amountMinor,
        narration: internalNarration,
      }, idempotencyKey);

      setLastTransferResult(result);
      if (result.isReplayed) {
        toast.info('Idempotent Replay Detected (HTTP 200)', {
          description: `Key "${idempotencyKey}" already processed. Money was NOT sent twice!`,
        });
      } else {
        toast.success('Internal Transfer Successful (HTTP 201)', {
          description: `Ref: ${result.transfer.reference} • ${formatMoney(result.transfer.amountMinor)} sent`,
        });
        // Auto-generate fresh key for next transfer if not explicitly testing replays
        if (!isReplayAttempt) {
          setIdempotencyKey(generateIdempotencyKey('trans'));
        }
      }
      refreshCustomerData();
      refreshStatement();
    } catch (err) {
      toast.error(`Transfer Refused: ${err.code}`, {
        description: `${err.detail} (HTTP ${err.status})`,
      });
    } finally {
      setIsSubmittingInternal(false);
    }
  };

  // External: Resolve account (Name enquiry)
  const handleResolveExternal = async () => {
    if (!extAccountNumber || extAccountNumber.length !== 10) {
      toast.error('Enter a 10-digit account number');
      return;
    }
    setResolvingExternal(true);
    setResolvedExternalBeneficiary(null);
    try {
      const resolved = await api.resolveBeneficiary(extBankCode, extAccountNumber);
      setResolvedExternalBeneficiary(resolved);
      toast.success(`Account Resolved: ${resolved.accountName}`);
    } catch (err) {
      toast.error('Name Enquiry Failed', { description: err.detail });
    } finally {
      setResolvingExternal(false);
    }
  };

  // External: Save Beneficiary
  const handleSaveBeneficiary = async () => {
    if (!selectedCustomer) {
      toast.error('Select a customer first');
      return;
    }
    setSavingBeneficiary(true);
    try {
      const saved = await api.createBeneficiary(selectedCustomer.id, extBankCode, extAccountNumber);
      setSavedBeneficiaries((prev) => [saved, ...prev]);
      setSelectedBeneficiaryId(saved.id);
      toast.success(`Saved Beneficiary: ${saved.accountName}`);
    } catch (err) {
      toast.error('Could not save beneficiary', { description: err.detail });
    } finally {
      setSavingBeneficiary(false);
    }
  };

  // Calculate external fee
  const calculateExternalFee = (amountNaira) => {
    const minor = nairaToKobo(amountNaira);
    if (minor <= 500000) return 1000; // ₦10
    if (minor <= 5000000) return 2500; // ₦25
    return 5000; // ₦50
  };

  const currentExtFee = calculateExternalFee(extAmountNaira);
  const extTotalDebitedMinor = nairaToKobo(extAmountNaira) + currentExtFee;

  // Submit External Transfer
  const handleSendExternal = async () => {
    if (!selectedAccount) {
      toast.error('Select an active source account');
      return;
    }
    let benId = selectedBeneficiaryId;
    if (!benId) {
      // Need to save beneficiary first if not saved
      if (!resolvedExternalBeneficiary) {
        toast.error('Please verify account name first (Name Enquiry)');
        return;
      }
      try {
        const saved = await api.createBeneficiary(selectedCustomer.id, extBankCode, extAccountNumber);
        setSavedBeneficiaries((prev) => [saved, ...prev]);
        benId = saved.id;
      } catch (e) {
        toast.error('Failed to create beneficiary');
        return;
      }
    }

    const amountMinor = nairaToKobo(extAmountNaira);
    setIsSubmittingExternal(true);
    try {
      const result = await api.transferExternal({
        sourceAccountId: selectedAccount.id,
        beneficiaryId: benId,
        amountMinor,
        narration: extNarration,
      }, extIdempotencyKey);

      setActiveExternalTransfer(result.transfer);
      toast.success('External Transfer Accepted (HTTP 202)', {
        description: 'Money placed on hold in Suspense. Polling bank outcome...',
      });
      setExtIdempotencyKey(generateIdempotencyKey('ext'));
      refreshCustomerData();
      refreshStatement();
      startPollingTransfer(result.transfer.id);
    } catch (err) {
      toast.error(`Transfer Refused: ${err.code}`, {
        description: `${err.detail} (HTTP ${err.status})`,
      });
    } finally {
      setIsSubmittingExternal(false);
    }
  };

  // Background poller for external transfer
  const startPollingTransfer = (transferId) => {
    setIsPollingExternal(true);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const fresh = await api.getTransfer(transferId);
        setActiveExternalTransfer(fresh);
        if (fresh.status === 'SUCCESS' || fresh.status === 'FAILED') {
          clearInterval(interval);
          setIsPollingExternal(false);
          refreshCustomerData();
          refreshStatement();
          if (fresh.status === 'SUCCESS') {
            toast.success(`External Transfer SUCCESS! (${fresh.status})`, {
              description: `Finalized by settlement worker. Ref: ${fresh.reference}`,
            });
          } else {
            toast.error(`External Transfer FAILED (${fresh.status})`, {
              description: 'Bank refused or timed out. Amount & fees automatically REFUNDED!',
            });
          }
        } else if (attempts >= 25) {
          clearInterval(interval);
          setIsPollingExternal(false);
        }
      } catch {
        clearInterval(interval);
        setIsPollingExternal(false);
      }
    }, 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Subtab Navigation */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setSubTab('internal')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            subTab === 'internal'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>Internal Account-to-Account</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
            Instant (Zero Fee)
          </span>
        </button>

        <button
          onClick={() => setSubTab('external')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            subTab === 'external'
              ? 'border-sky-500 text-sky-400 bg-sky-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>External Transfer (Other Banks)</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-bold">
            Simulated Gateway
          </span>
        </button>
      </div>

      {/* TAB 1: INTERNAL TRANSFER */}
      {subTab === 'internal' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Form */}
          <div className="lg:col-span-2 panel-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Send Money to PayBridge Account</h3>
                <p className="text-xs text-slate-400">Atomic, single-transaction double-entry transfer with idempotency.</p>
              </div>
            </div>

            {/* Source Account Info */}
            <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 uppercase font-semibold block">Source Account</span>
                <span className="mono font-bold text-white text-sm">
                  {selectedAccount ? selectedAccount.accountNumber : 'No account selected'}
                </span>
                <span className="text-xs text-slate-400 ml-2">({selectedCustomer?.firstName} {selectedCustomer?.lastName})</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 uppercase font-semibold block">Available</span>
                <span className="mono font-bold text-emerald-400 text-sm">
                  {selectedAccount ? formatMoney(selectedAccount.balanceMinor, selectedAccount.currency) : '₦0.00'}
                </span>
              </div>
            </div>

            {/* Destination NUBAN */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Recipient 10-Digit NUBAN
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={10}
                  value={destNuban}
                  onChange={(e) => {
                    setDestNuban(e.target.value.replace(/\D/g, ''));
                    setResolvedDestAccount(null);
                  }}
                  placeholder="e.g. 1000000024"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white mono text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleVerifyNuban()}
                  disabled={isVerifyingNuban || destNuban.length !== 10}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Search className="w-3.5 h-3.5" />
                  {isVerifyingNuban ? 'Checking...' : 'Verify'}
                </button>
              </div>
              {resolvedDestAccount && (
                <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verified Account ({resolvedDestAccount.currency}) • Ready to transfer
                </div>
              )}
            </div>

            {/* Amount & Narration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Amount in Naira (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm font-bold">₦</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={internalAmountNaira}
                    onChange={(e) => setInternalAmountNaira(e.target.value)}
                    placeholder="500.00"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white mono text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-semibold"
                  />
                </div>
                <span className="mono text-[11px] text-slate-400 block mt-1">
                  = {nairaToKobo(internalAmountNaira).toLocaleString()} kobo
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Narration / Note
                </label>
                <input
                  type="text"
                  value={internalNarration}
                  onChange={(e) => setInternalNarration(e.target.value)}
                  placeholder="e.g. rent, groceries"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Idempotency Key */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-emerald-400" /> Idempotency-Key Header
                </label>
                <button
                  type="button"
                  onClick={() => setIdempotencyKey(generateIdempotencyKey('trans'))}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1"
                >
                  Generate New Key
                </button>
              </div>
              <input
                type="text"
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 mono text-xs focus:border-emerald-500 outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Ensures network retries do not execute duplicates. Same key + payload returns HTTP 200 without moving money again.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleSendInternal(false)}
                disabled={isSubmittingInternal || !selectedAccount}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40"
              >
                <Send className="w-4 h-4 fill-current" />
                {isSubmittingInternal ? 'Processing Atomic Transfer...' : `Send ₦${internalAmountNaira || '0'}`}
              </button>

              <button
                type="button"
                onClick={() => handleSendInternal(true)}
                disabled={isSubmittingInternal || !selectedAccount}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-40"
                title="Send the exact same request with the same Idempotency-Key to test replay safety"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Test Duplicate Replay (Prove Safety)
              </button>
            </div>

          </div>

          {/* Right Column: Transfer Result & Explanation */}
          <div className="panel-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Info className="w-4 h-4 text-emerald-400" /> Idempotent Transfer Result
            </h3>

            {lastTransferResult ? (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 ${
                    lastTransferResult.isReplayed 
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {lastTransferResult.isReplayed ? <RotateCw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {lastTransferResult.isReplayed ? 'REPLAYED (HTTP 200)' : 'NEW TRANSFER (HTTP 201)'}
                  </span>
                  <span className="mono text-[10px] text-slate-400">
                    HTTP {lastTransferResult.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Transfer ID:</span>
                    <span className="mono text-slate-200 text-[11px] truncate max-w-[140px]" title={lastTransferResult.transfer.id}>
                      {lastTransferResult.transfer.id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Reference:</span>
                    <span className="mono text-emerald-400 font-bold">{lastTransferResult.transfer.reference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Amount Sent:</span>
                    <span className="mono text-white font-bold">{formatMoney(lastTransferResult.transfer.amountMinor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fee Charged:</span>
                    <span className="mono text-slate-300">{formatMoney(lastTransferResult.transfer.feeMinor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className="text-emerald-400 font-bold">{lastTransferResult.transfer.status}</span>
                  </div>
                </div>

                {lastTransferResult.isReplayed ? (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                    <strong>Zero Double-Spend Guarantee:</strong> Spring Boot detected the matching SHA-256 fingerprint on key <code>{idempotencyKey}</code> and returned the saved record without hitting the ledger or moving money again.
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300">
                    <strong>One Atomic Transaction:</strong> Allowance reserved, both rows locked in ID order, journal lines written, Postgres trigger checked sum = 0, and transfer marked SUCCESS.
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Submit an internal transfer or duplicate replay to view live transaction receipt and idempotency proofs.
              </div>
            )}

            <div className="pt-2 text-xs text-slate-400 space-y-2 border-t border-slate-800">
              <div className="font-semibold text-slate-300">Try DEMO-GUIDE Steps:</div>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>Ada sends Bola ₦500.00 with a unique key (Step 4)</li>
                <li>Click <em>Test Duplicate Replay</em> with the same key to verify HTTP 200 (Step 5)</li>
                <li>Verify recipient was paid exactly once</li>
              </ul>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: EXTERNAL TRANSFER (OTHER BANKS) */}
      {subTab === 'external' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* External Form */}
          <div className="lg:col-span-2 panel-card p-6 space-y-5">
            <div>
              <h3 className="text-base font-bold text-white">External Bank Transfer & Settlement</h3>
              <p className="text-xs text-slate-400">
                Dispatches to payment gateway / simulated bank with asynchronous outbox and reconciler.
              </p>
            </div>

            {/* Saved Beneficiaries Quick Select */}
            {savedBeneficiaries.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Saved Beneficiaries
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {savedBeneficiaries.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setSelectedBeneficiaryId(b.id);
                        setExtBankCode(b.bankCode);
                        setExtAccountNumber(b.accountNumber);
                        setResolvedExternalBeneficiary({ accountName: b.accountName });
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap transition ${
                        selectedBeneficiaryId === b.id
                          ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-semibold'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {b.accountName} ({b.accountNumber.slice(-4)})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bank Select & Account Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Destination Bank
                </label>
                <select
                  value={extBankCode}
                  onChange={(e) => {
                    setExtBankCode(e.target.value);
                    setResolvedExternalBeneficiary(null);
                    setSelectedBeneficiaryId('');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:border-sky-500 outline-none"
                >
                  {NIGERIAN_BANKS.map((b) => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  10-Digit Account Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={10}
                    value={extAccountNumber}
                    onChange={(e) => {
                      setExtAccountNumber(e.target.value.replace(/\D/g, ''));
                      setResolvedExternalBeneficiary(null);
                      setSelectedBeneficiaryId('');
                    }}
                    placeholder="e.g. 0123453333"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white mono text-sm focus:border-sky-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleResolveExternal()}
                    disabled={resolvingExternal || extAccountNumber.length !== 10}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-sky-400 transition flex items-center gap-1 disabled:opacity-40"
                  >
                    <Search className="w-3.5 h-3.5" />
                    {resolvingExternal ? 'Checking...' : 'Resolve'}
                  </button>
                </div>
              </div>
            </div>

            {/* Resolved Beneficiary Alert */}
            {resolvedExternalBeneficiary && (
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-400" />
                  <div>
                    <span className="text-slate-400">Account Name: </span>
                    <strong className="text-white font-bold">{resolvedExternalBeneficiary.accountName}</strong>
                  </div>
                </div>
                {!selectedBeneficiaryId && (
                  <button
                    type="button"
                    onClick={() => handleSaveBeneficiary()}
                    disabled={savingBeneficiary}
                    className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {savingBeneficiary ? 'Saving...' : 'Save Beneficiary'}
                  </button>
                )}
              </div>
            )}

            {/* Amount & Stepped Fee Calculation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Transfer Amount in Naira (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm font-bold">₦</span>
                  <input
                    type="number"
                    min="100"
                    step="1"
                    value={extAmountNaira}
                    onChange={(e) => setExtAmountNaira(e.target.value)}
                    placeholder="1000"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white mono text-sm focus:border-sky-500 outline-none font-semibold"
                  />
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                  <span>Min: ₦100.00</span>
                  <span>Stepped fee: <strong className="text-sky-400">{formatMoney(currentExtFee)}</strong></span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Narration
                </label>
                <input
                  type="text"
                  value={extNarration}
                  onChange={(e) => setExtNarration(e.target.value)}
                  placeholder="e.g. consulting fee"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:border-sky-500 outline-none"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Total hold: <strong className="text-white">{formatMoney(extTotalDebitedMinor)}</strong> (Amount + Fee)
                </div>
              </div>
            </div>

            {/* Idempotency */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Idempotency Key:</span>
              <span className="mono text-slate-200">{extIdempotencyKey}</span>
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => handleSendExternal()}
              disabled={isSubmittingExternal || !selectedAccount || (!resolvedExternalBeneficiary && !selectedBeneficiaryId)}
              className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm shadow-lg shadow-sky-600/20 transition flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40"
            >
              <Send className="w-4 h-4 fill-current" />
              {isSubmittingExternal 
                ? 'Submitting to Outbox...' 
                : `Transfer ${formatMoney(nairaToKobo(extAmountNaira))} (+ ${formatMoney(currentExtFee)} fee)`}
            </button>

            {/* Simulated Bank Guide Chips */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Simulated Bank Testing Profiles (Account Suffixes)
              </div>
              <p className="text-[11px] text-slate-400">
                The built-in test bank switches behavior based on the last 4 digits of the account number:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setExtAccountNumber('0123453333');
                    setResolvedExternalBeneficiary(null);
                  }}
                  className="text-left p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60"
                >
                  <strong className="text-emerald-400">Ends in 3333:</strong> Instant Success (~2s)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExtAccountNumber('0123451111');
                    setResolvedExternalBeneficiary(null);
                  }}
                  className="text-left p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60"
                >
                  <strong className="text-rose-400">Ends in 1111:</strong> Immediate Refusal & Refund (~3s)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExtAccountNumber('0123451234');
                    setResolvedExternalBeneficiary(null);
                  }}
                  className="text-left p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60"
                >
                  <strong className="text-sky-400">Ends in 1234:</strong> Background Reconciler (~14s)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExtAccountNumber('0123455555');
                    setResolvedExternalBeneficiary(null);
                  }}
                  className="text-left p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60"
                >
                  <strong className="text-amber-400">Ends in 5555:</strong> Gateway Timeout (1x pay) (~19s)
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Live External Transfer Tracker */}
          <div className="panel-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">External Settlement Monitor</h3>
              {isPollingExternal && (
                <span className="flex items-center gap-1.5 text-xs text-sky-400 animate-pulse font-medium">
                  <RotateCw className="w-3.5 h-3.5 animate-spin" /> Polling bank...
                </span>
              )}
            </div>

            {activeExternalTransfer ? (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 ${
                    activeExternalTransfer.status === 'SUCCESS'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : activeExternalTransfer.status === 'FAILED'
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse'
                  }`}>
                    {activeExternalTransfer.status === 'SUCCESS' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {activeExternalTransfer.status === 'FAILED' && <XCircle className="w-3.5 h-3.5" />}
                    {activeExternalTransfer.status !== 'SUCCESS' && activeExternalTransfer.status !== 'FAILED' && (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                    {activeExternalTransfer.status}
                  </span>
                  <span className="mono text-[10px] text-slate-400">EXTERNAL</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Transfer Ref:</span>
                    <span className="mono text-white font-bold">{activeExternalTransfer.reference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Amount:</span>
                    <span className="mono text-white">{formatMoney(activeExternalTransfer.amountMinor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fee:</span>
                    <span className="mono text-sky-400">{formatMoney(activeExternalTransfer.feeMinor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Stage:</span>
                    <span className="mono text-slate-300">
                      {activeExternalTransfer.status === 'PENDING' && 'Outbox queue (Worker dispatched in ~2s)'}
                      {activeExternalTransfer.status === 'PROCESSING' && 'Bank accepted, reconciler watching (~10-14s)'}
                      {activeExternalTransfer.status === 'SUCCESS' && 'Paid and settled. Fee earned.'}
                      {activeExternalTransfer.status === 'FAILED' && 'Bank refused. Full refund returned.'}
                    </span>
                  </div>
                </div>

                {/* Progress bar animation */}
                {isPollingExternal && (
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-sky-400 h-1.5 rounded-full animate-indeterminate" style={{ width: '60%' }} />
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Initiate an external transfer to watch the asynchronous outbox dispatcher and reconciler progress in real time.
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
              <div className="font-semibold text-slate-300">The 3 Architecture Rules:</div>
              <div>1. <strong>Never call bank inside DB transaction</strong> (holds locks).</div>
              <div>2. <strong>Timeout means "unknown", not failed</strong> (keeps money on hold).</div>
              <div>3. <strong>Applying bank's answer is safe to repeat</strong> (idempotent reconciler).</div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
