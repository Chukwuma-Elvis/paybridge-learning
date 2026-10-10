import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { TransfersTab } from './components/TransfersTab';
import { LedgerStatementTab } from './components/LedgerStatementTab';
import { CustomersTab } from './components/CustomersTab';
import { ComplianceTab } from './components/ComplianceTab';
import { NotificationsTab } from './components/NotificationsTab';
import { DevFundModal } from './components/DevFundModal';
import { DemoRunnerModal } from './components/DemoRunnerModal';
import { BackendSettingsModal } from './components/BackendSettingsModal';
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  ReceiptText, 
  Users, 
  ShieldCheck, 
  Bell, 
  Sparkles,
  Play
} from 'lucide-react';

export default function App() {
  const { customers, accounts, backendOnline } = useApp();

  const [activeTab, setActiveTab] = useState('overview');
  const [transfersDefaultSubTab, setTransfersDefaultSubTab] = useState('internal');
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const navigateTo = (tab, subTab = 'internal') => {
    setActiveTab(tab);
    if (tab === 'transfers') {
      setTransfersDefaultSubTab(subTab);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
    { id: 'statement', label: 'Ledger Statements', icon: ReceiptText },
    { id: 'customers', label: 'Customers & Accounts', icon: Users },
    { id: 'compliance', label: 'Compliance & Limits', icon: ShieldCheck },
    { id: 'notifications', label: 'Alerts Inbox', icon: Bell },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white">
      
      {/* Top Header */}
      <Navbar
        onOpenDemo={() => setDemoModalOpen(true)}
        onOpenNewCustomer={() => setActiveTab('customers')}
        onOpenSettings={() => setSettingsModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Empty state invitation if no customers */}
        {customers.length === 0 && (
          <div className="panel-card-glow p-6 flex flex-col sm:flex-row items-center justify-between gap-4 border border-emerald-500/30">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Welcome to PayBridge Core Banking Portal</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Get started by registering customers (e.g. Ada Obi & Bola Eze) or run the automated 10-step demo script.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => setDemoModalOpen(true)}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-md transition flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Run 1-Click Demo Tour
              </button>
              <button
                onClick={() => setActiveTab('customers')}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition"
              >
                Register Manually
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation Bar */}
        <div className="flex overflow-x-auto gap-2 p-1.5 rounded-2xl bg-slate-900/80 border border-slate-800">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Display */}
        <div className="transition-all">
          {activeTab === 'overview' && (
            <OverviewTab
              onNavigate={navigateTo}
              onOpenFundModal={() => setFundModalOpen(true)}
              onOpenNewAccountModal={() => setActiveTab('customers')}
            />
          )}

          {activeTab === 'transfers' && (
            <TransfersTab defaultSubTab={transfersDefaultSubTab} />
          )}

          {activeTab === 'statement' && (
            <LedgerStatementTab onOpenFundModal={() => setFundModalOpen(true)} />
          )}

          {activeTab === 'customers' && (
            <CustomersTab />
          )}

          {activeTab === 'compliance' && (
            <ComplianceTab onNavigate={navigateTo} />
          )}

          {activeTab === 'notifications' && (
            <NotificationsTab />
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <p>PayBridge Double-Entry Core Settlement Engine • Spring Modulith Architecture</p>
      </footer>

      {/* Modals */}
      <DevFundModal
        isOpen={fundModalOpen}
        onClose={() => setFundModalOpen(false)}
      />

      <DemoRunnerModal
        isOpen={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
      />

      <BackendSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />

    </div>
  );
}
