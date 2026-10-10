import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bell, Mail, MessageSquare, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export function NotificationsTab() {
  const { selectedCustomer, notifications, refreshCustomerData } = useApp();
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    await refreshCustomerData();
    setLoading(false);
    toast.success('Alerts inbox refreshed');
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="panel-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">Event Alerts & Notifications</h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase">
              Spring Modulith Events
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Asynchronously dispatched to customer after transaction commit. Decoupled from transfer execution.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading || !selectedCustomer}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          Check For New Alerts
        </button>
      </div>

      {/* Notifications List */}
      <div className="panel-card p-6">
        <h3 className="text-sm font-semibold text-white mb-4">
          Inbox for {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : 'Active Customer'} ({notifications.length})
        </h3>

        {notifications.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No alerts delivered yet. Send or receive a transfer to trigger automated SMS & Email alerts.
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => {
              const isSms = n.channel === 'SMS';
              return (
                <div
                  key={n.id}
                  className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`p-1.5 rounded-lg ${
                        isSms ? 'bg-emerald-500/10 text-emerald-400' : 'bg-sky-500/10 text-sky-400'
                      }`}>
                        {isSms ? <MessageSquare className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                      </span>
                      <span className="font-bold text-white uppercase text-[11px] tracking-wider">
                        {n.channel} Alert
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 mono text-[11px]">{n.recipient}</span>
                    </div>

                    <span className="text-[11px] text-slate-400 mono">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-slate-200 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 font-medium">
                    "{n.message}"
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>Event: <strong className="text-slate-300">{n.eventType}</strong></span>
                    <span className="mono">Ref: {n.reference}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
          <strong>Event-Driven Decoupling:</strong> The transfer module does not call notifications directly. It publishes an internal <code className="text-slate-300">TransferCompleted</code> event. If SMS delivery delays or network drops occur, the money movement is already 100% committed and protected!
        </div>
      </div>

    </div>
  );
}
