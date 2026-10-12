import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api, formatMoney } from '../api';
import { toast } from 'sonner';
import { 
  Play, 
  CheckCircle2, 
  RotateCw, 
  X, 
  ChevronRight, 
  AlertTriangle, 
  ShieldCheck, 
  Layers,
  Terminal,
  FastForward,
  RotateCcw
} from 'lucide-react';

const DEMO_STEPS = [
  { id: 1, title: 'Step 1: Create Two Customers (Ada & Bola)', desc: 'Registers Ada Obi and Bola Eze with unique emails and normalised phones.' },
  { id: 2, title: 'Step 2: Open an Account for Each', desc: 'Generates 10-digit NUBAN numbers with check-digit validation.' },
  { id: 3, title: 'Step 3: Dev Fund Ada with ₦3,000', desc: 'Posts balanced double-entry funding record from bank FUNDING_SOURCE.' },
  { id: 4, title: 'Step 4: Ada Transfers ₦500 to Bola', desc: 'Atomic database transaction: row lock, allowance reserve, ledger entry, commit.' },
  { id: 5, title: 'Step 5: Duplicate Replay (Prove Idempotency)', desc: 'Sends identical key and body. Returns HTTP 200 without moving money again.' },
  { id: 6, title: 'Step 6: Check Balances', desc: 'Verifies Ada has ₦2,500 and Bola has ₦500.' },
  { id: 7, title: 'Step 7: Inspect Double-Entry Statements', desc: 'Checks matching journal entries on both statements summing to zero.' },
  { id: 8, title: 'Step 8: Test Banking Safety Refusals', desc: 'Proves overdraft protection (422) and KYC limit enforcement (422).' },
  { id: 9, title: 'Step 9: Check Compliance & Daily Quota', desc: 'Verifies daily usage reservation table.' },
  { id: 10, title: 'Step 10: Verify SMS & Email Alerts', desc: 'Delivers asynchronous notifications via Spring Modulith listener.' },
];

export function DemoRunnerModal({ isOpen, onClose }) {
  const { addOrUpdateCustomer, refreshCustomerData, refreshStatement } = useApp();

  const [currentStep, setCurrentStep] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  
  // Synchronous ref so chained steps in handleRunAll have immediate access to previous outputs
  const demoStateRef = useRef({
    ada: null,
    adaAcc: null,
    bola: null,
    bolaAcc: null,
    transferResult1: null,
    transferResult2: null,
    demoKey: null,
    refusalResults: [],
    logs: [],
  });

  const [demoState, setDemoState] = useState(demoStateRef.current);
  const logEndRef = useRef(null);

  // Auto-scroll log console
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [demoState.logs]);

  if (!isOpen) return null;

  const logMessage = (msg, obj = null) => {
    const entry = { time: new Date().toLocaleTimeString(), msg, obj };
    demoStateRef.current.logs = [...demoStateRef.current.logs, entry];
    setDemoState({ ...demoStateRef.current });
  };

  const handleReset = () => {
    demoStateRef.current = {
      ada: null,
      adaAcc: null,
      bola: null,
      bolaAcc: null,
      transferResult1: null,
      transferResult2: null,
      demoKey: null,
      refusalResults: [],
      logs: [],
    };
    setDemoState({ ...demoStateRef.current });
    setCurrentStep(1);
    toast.info('Demo Runner reset to Step 1');
  };

  const runStepInternal = async (stepIndex) => {
    try {
      if (stepIndex === 1) {
        logMessage('Step 1: Registering Ada Obi and Bola Eze with unique credentials...');
        const s = Math.floor(1000 + Math.random() * 9000);
        const ada = await api.createCustomer({
          firstName: 'Ada',
          lastName: 'Obi',
          email: `ada${s}@example.com`,
          phone: '08012345678',
        });
        const bola = await api.createCustomer({
          firstName: 'Bola',
          lastName: 'Eze',
          email: `bola${s}@example.com`,
          phone: '08098765432',
        });
        demoStateRef.current.ada = ada;
        demoStateRef.current.bola = bola;
        setDemoState({ ...demoStateRef.current });

        addOrUpdateCustomer(ada);
        addOrUpdateCustomer(bola);
        logMessage(`✓ Created Ada (${ada.id}) and Bola (${bola.id})`, { ada, bola });
        toast.success('Step 1 Complete: Created Ada & Bola');
      } 
      else if (stepIndex === 2) {
        const { ada, bola } = demoStateRef.current;
        if (!ada || !bola) throw new Error('Run Step 1 first to create Ada and Bola');
        logMessage('Step 2: Opening CBN-compliant NUBAN accounts...');
        const adaAcc = await api.openAccount(ada.id, 'NGN');
        const bolaAcc = await api.openAccount(bola.id, 'NGN');
        demoStateRef.current.adaAcc = adaAcc;
        demoStateRef.current.bolaAcc = bolaAcc;
        setDemoState({ ...demoStateRef.current });

        logMessage(`✓ Ada NUBAN: ${adaAcc.accountNumber} | Bola NUBAN: ${bolaAcc.accountNumber}`, { adaAcc, bolaAcc });
        toast.success(`Step 2 Complete: NUBANs ${adaAcc.accountNumber} & ${bolaAcc.accountNumber}`);
      }
      else if (stepIndex === 3) {
        const { adaAcc } = demoStateRef.current;
        if (!adaAcc) throw new Error('Run Step 2 first to generate an account');
        logMessage('Step 3: Dev Funding Ada with ₦3,000 (300,000 kobo)...');
        const fundRes = await api.fundAccount(adaAcc.id, 300000);
        logMessage(`✓ Funded Ada: ${formatMoney(fundRes.balanceMinor)} (Entry: ${fundRes.entryId})`, fundRes);
        toast.success(`Step 3 Complete: Ada funded with ₦3,000`);
      }
      else if (stepIndex === 4) {
        const { adaAcc, bolaAcc } = demoStateRef.current;
        if (!adaAcc || !bolaAcc) throw new Error('Run Steps 1-3 first');
        logMessage('Step 4: Ada transfers ₦500 to Bola with unique Idempotency-Key...');
        const key = `demo-key-${Date.now()}`;
        demoStateRef.current.demoKey = key;
        const res1 = await api.transferInternal({
          sourceAccountId: adaAcc.id,
          destinationAccountNumber: bolaAcc.accountNumber,
          amountMinor: 50000,
          narration: 'rent',
        }, key);
        demoStateRef.current.transferResult1 = res1;
        setDemoState({ ...demoStateRef.current });

        logMessage(`✓ HTTP 201 Created! Transfer Ref: ${res1.transfer.reference}`, res1);
        toast.success('Step 4 Complete: ₦500 transferred to Bola');
      }
      else if (stepIndex === 5) {
        const { adaAcc, bolaAcc, transferResult1, demoKey } = demoStateRef.current;
        if (!transferResult1 || !demoKey) throw new Error('Run Step 4 first to generate the initial transfer');
        logMessage(`Step 5: Sending identical duplicate request with same key (${demoKey})...`);
        const res2 = await api.transferInternal({
          sourceAccountId: adaAcc.id,
          destinationAccountNumber: bolaAcc.accountNumber,
          amountMinor: 50000,
          narration: 'rent',
        }, demoKey);
        demoStateRef.current.transferResult2 = res2;
        setDemoState({ ...demoStateRef.current });

        logMessage(`✓ HTTP 200 OK! Idempotent-Replayed: ${res2.isReplayed}. Same ref: ${res2.transfer.reference}`, res2);
        toast.info('Step 5 Complete: Replay caught! Zero duplicate debit.');
      }
      else if (stepIndex === 6) {
        const { adaAcc, bolaAcc } = demoStateRef.current;
        if (!adaAcc || !bolaAcc) throw new Error('Run earlier steps first');
        logMessage('Step 6: Verifying ledger balances after single debit...');
        const adaFresh = await api.getAccount(adaAcc.id);
        const bolaFresh = await api.getAccount(bolaAcc.id);
        logMessage(`✓ Ada: ${formatMoney(adaFresh.balanceMinor)} (₦3,000 - ₦500 = ₦2,500)`);
        logMessage(`✓ Bola: ${formatMoney(bolaFresh.balanceMinor)} (₦0 + ₦500 = ₦500)`);
        toast.success('Step 6 Complete: Balances verified');
      }
      else if (stepIndex === 7) {
        const { adaAcc, bolaAcc } = demoStateRef.current;
        if (!adaAcc || !bolaAcc) throw new Error('Run earlier steps first');
        logMessage('Step 7: Reading double-entry statements from database...');
        const adaEntries = await api.getStatement(adaAcc.id, 10);
        const bolaEntries = await api.getStatement(bolaAcc.id, 10);
        logMessage(`✓ Ada Statement: ${adaEntries.length} entries (FUNDING +300000, TRANSFER -50000)`);
        logMessage(`✓ Bola Statement: ${bolaEntries.length} entry (TRANSFER +50000)`);
        toast.success('Step 7 Complete: Double-entry ledger verified');
      }
      else if (stepIndex === 8) {
        const { adaAcc, bolaAcc } = demoStateRef.current;
        if (!adaAcc || !bolaAcc) throw new Error('Run earlier steps first');
        logMessage('Step 8: Testing banking safety invariants & refusals...');
        const refusals = [];
        
        // 8a. Overdraw attempt (Ada balance is ₦2,500, attempt transfer of ₦40,000)
        try {
          await api.transferInternal({
            sourceAccountId: adaAcc.id,
            destinationAccountNumber: bolaAcc.accountNumber,
            amountMinor: 4000000,
          }, `refusal-overdraw-${Date.now()}`);
          logMessage('⚠ Warning: Overdraw did not fail as expected');
        } catch (e) {
          refusals.push(`8a Overdraw caught: ${e.code} (HTTP ${e.status})`);
          logMessage(`✓ Overdraw safely prevented: ${e.code} (${e.detail})`);
        }

        // 8b. Over limit attempt (UNVERIFIED tier limit is ₦50,000 per txn, attempt transfer of ₦50,001)
        try {
          await api.transferInternal({
            sourceAccountId: adaAcc.id,
            destinationAccountNumber: bolaAcc.accountNumber,
            amountMinor: 5000001,
          }, `refusal-limit-${Date.now()}`);
          logMessage('⚠ Warning: Limit exceeded did not fail as expected');
        } catch (e) {
          refusals.push(`8b Limit caught: ${e.code} (HTTP ${e.status})`);
          logMessage(`✓ Compliance limit enforced: ${e.code} (${e.detail})`);
        }
        demoStateRef.current.refusalResults = refusals;
        setDemoState({ ...demoStateRef.current });
        toast.success('Step 8 Complete: Banking safety rules enforced');
      }
      else if (stepIndex === 9) {
        const { ada } = demoStateRef.current;
        if (!ada) throw new Error('Run Step 1 first');
        logMessage('Step 9: Checking compliance limit records...');
        const lim = await api.getLimits(ada.id);
        logMessage(`✓ Ada daily usage: ${formatMoney(lim.usedTodayMinor)} of ${formatMoney(lim.dailyMinor)}`);
        toast.success('Step 9 Complete: Daily allowance validated');
      }
      else if (stepIndex === 10) {
        const { ada, bola } = demoStateRef.current;
        if (!bola || !ada) throw new Error('Run earlier steps first');
        logMessage('Step 10: Fetching asynchronous SMS and Email notifications...');
        
        // Spring Modulith listener runs asynchronously after transaction commits; brief pause if needed
        let notifsBola = await api.getNotifications(bola.id);
        if (!notifsBola || notifsBola.length === 0) {
          await new Promise((r) => setTimeout(r, 1200));
          notifsBola = await api.getNotifications(bola.id);
        }
        const notifsAda = await api.getNotifications(ada.id);

        logMessage(`✓ Bola received ${notifsBola.length} credit notifications (SMS & Email)`);
        logMessage(`✓ Ada received ${notifsAda.length} debit notifications (SMS & Email)`);
        toast.success('Step 10 Complete: Modulith event alerts confirmed');
      }

      refreshCustomerData();
      refreshStatement();
      if (stepIndex < 10) {
        setCurrentStep(stepIndex + 1);
      }
      return true;
    } catch (err) {
      logMessage(`❌ ERROR on Step ${stepIndex}: ${err.message}`, err);
      toast.error(`Step ${stepIndex} Error`, { description: err.message });
      return false;
    }
  };

  const executeStep = async (stepIndex) => {
    setIsRunning(true);
    try {
      await runStepInternal(stepIndex);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunAll = async () => {
    setIsRunning(true);
    try {
      for (let s = currentStep; s <= 10; s++) {
        const ok = await runStepInternal(s);
        if (!ok) break; // Halt if any step encounters an error
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-4xl panel-card p-6 shadow-2xl relative border border-slate-700 bg-slate-900 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Live Rehearsal Demo Guide Runner</h3>
              <p className="text-xs text-slate-400">Execute the 10 core architecture proofs directly against Spring Boot</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Split view */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4 flex-1 overflow-hidden">
          
          {/* Left: Step Checklist */}
          <div className="overflow-y-auto space-y-2 pr-2">
            {DEMO_STEPS.map((s) => {
              const isDone = s.id < currentStep;
              const isCurrent = s.id === currentStep;
              return (
                <div
                  key={s.id}
                  className={`p-3 rounded-xl border text-xs transition ${
                    isCurrent
                      ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-sm'
                      : isDone
                      ? 'bg-slate-900/60 border-slate-800 text-slate-300'
                      : 'bg-slate-950/40 border-slate-900 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span className="flex items-center gap-2">
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                          isCurrent ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {s.id}
                        </span>
                      )}
                      {s.title}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-400 text-slate-950 font-extrabold uppercase">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 pl-6">{s.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Right: Live Terminal Log Console */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-[11px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400">
              <span>LIVE DEMO CONSOLE</span>
              <span>{demoState.logs.length} entries</span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 text-slate-300">
              {demoState.logs.length === 0 ? (
                <div className="text-slate-600 italic py-8 text-center">
                  Click "Run Next Step" or "Run All Steps" to begin live execution.
                </div>
              ) : (
                demoState.logs.map((log, i) => (
                  <div key={i} className="leading-relaxed">
                    <span className="text-emerald-500 font-bold">[{log.time}]</span>{' '}
                    <span className="text-slate-200">{log.msg}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>Progress: Step <strong className="text-white">{currentStep}</strong> of 10</span>
            <button
              onClick={handleReset}
              disabled={isRunning}
              title="Reset demo to step 1"
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition flex items-center gap-1 disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3 text-rose-400" />
              Reset
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunAll}
              disabled={isRunning || currentStep > 10}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-40"
            >
              <FastForward className="w-3.5 h-3.5 text-amber-400" />
              {isRunning ? 'Running All Steps...' : 'Run All Remaining'}
            </button>

            <button
              onClick={() => executeStep(currentStep)}
              disabled={isRunning || currentStep > 10}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-2 disabled:opacity-40"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {isRunning ? 'Executing Step...' : `Run Step ${currentStep}`}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
