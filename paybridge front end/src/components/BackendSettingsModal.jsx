import React, { useState } from 'react';
import { getBaseUrl, setCustomBaseUrl, api } from '../api';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { 
  Server, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RotateCw, 
  ExternalLink,
  Power,
  Globe
} from 'lucide-react';

export function BackendSettingsModal({ isOpen, onClose }) {
  const { checkHealth, backendOnline } = useApp();
  const [currentUrl, setCurrentUrl] = useState(() => getBaseUrl() || '');
  const [testing, setTesting] = useState(false);
  const [waking, setWaking] = useState(false);
  const [pingResult, setPingResult] = useState(null);

  if (!isOpen) return null;

  const handleTestConnection = async (urlToTest) => {
    setTesting(true);
    setPingResult(null);
    const start = performance.now();
    try {
      // Temporarily store to test
      setCustomBaseUrl(urlToTest);
      const res = await api.checkHealth();
      const latency = Math.round(performance.now() - start);
      setPingResult({
        success: res?.status === 'UP',
        status: res?.status || 'CONNECTED',
        latency,
      });
      toast.success(`Connected! Latency: ${latency}ms`, {
        description: `Backend health status: ${res?.status || 'UP'}`,
      });
      await checkHealth();
    } catch (err) {
      setPingResult({
        success: false,
        error: err.message,
      });
      toast.error('Connection Failed', {
        description: err.message,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleWakeRender = async () => {
    setWaking(true);
    toast.info('Sending Wake-Up Ping to Render...', {
      description: 'Render free tier instances take ~30-60s to boot from sleep. Please wait...',
      duration: 15000,
    });
    try {
      const res = await api.wakeBackend(75000);
      toast.success('Render Backend is WIDE AWAKE!', {
        description: `Status: ${res?.status || 'UP'}. Dispatcher & Reconciler timers active.`,
      });
      setPingResult({ success: true, status: 'UP', latency: 0 });
      await checkHealth();
    } catch (err) {
      toast.error('Wake-Up Timeout or Error', {
        description: err.message || 'Make sure your Render service URL is correct.',
      });
    } finally {
      setWaking(false);
    }
  };

  const handleSave = () => {
    setCustomBaseUrl(currentUrl);
    checkHealth();
    toast.success('Backend URL Configuration Saved');
    onClose();
  };

  const handleResetDefault = () => {
    setCurrentUrl('');
    setCustomBaseUrl('');
    checkHealth();
    toast.info('Reset to Default Proxy (/api)');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg panel-card p-6 shadow-2xl relative border border-slate-700 bg-slate-900">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Backend & Render Connection</h3>
            <p className="text-xs text-slate-400">Configure where this Vercel frontend sends API calls</p>
          </div>
        </div>

        {/* Input */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Backend Base URL (Render or Local)
            </label>
            <input
              type="text"
              value={currentUrl}
              onChange={(e) => setCurrentUrl(e.target.value)}
              placeholder="https://paybridge-zkvm.onrender.com (or empty for relative /api)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white mono text-xs outline-none focus:border-sky-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Leave empty to use Vercel's built-in <code className="text-slate-300">vercel.json</code> rewrite proxy, or enter your exact Render URL.
            </p>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setCurrentUrl('https://paybridge-zkvm.onrender.com');
                handleTestConnection('https://paybridge-zkvm.onrender.com');
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-sky-300 font-semibold flex items-center gap-1"
            >
              <Globe className="w-3 h-3" /> Render: paybridge-zkvm.onrender.com
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentUrl('http://localhost:8080');
                handleTestConnection('http://localhost:8080');
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-emerald-300 font-semibold flex items-center gap-1"
            >
              Local: localhost:8080
            </button>
          </div>
        </div>

        {/* Test Result Box */}
        {pingResult && (
          <div className={`p-3.5 rounded-xl border mb-4 text-xs ${
            pingResult.success 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <div className="flex items-center gap-2 font-bold mb-0.5">
              {pingResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{pingResult.success ? `Status: ${pingResult.status}` : 'Connection Failed'}</span>
              {pingResult.latency > 0 && (
                <span className="mono text-[10px] font-normal text-slate-400">({pingResult.latency}ms)</span>
              )}
            </div>
            {pingResult.error && (
              <p className="text-[11px] text-rose-400 mt-1">{pingResult.error}</p>
            )}
          </div>
        )}

        {/* Wake Render Callout */}
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 mb-5 space-y-2">
          <div className="font-semibold flex items-center gap-1.5">
            <Power className="w-4 h-4" /> Render Free Tier Sleep Notice
          </div>
          <p className="text-[11px] text-slate-300">
            Render spins down inactive free web services. If your backend is sleeping, the first request will take ~45s.
          </p>
          <button
            type="button"
            onClick={handleWakeRender}
            disabled={waking}
            className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <RotateCw className={`w-3.5 h-3.5 ${waking ? 'animate-spin' : ''}`} />
            {waking ? 'Pinging & Waking Render Instance...' : 'Wake Up Render Backend (Send Liveness Ping)'}
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleResetDefault}
            className="text-xs text-slate-400 hover:text-white hover:underline"
          >
            Reset Default
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestConnection(currentUrl)}
              disabled={testing}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-40"
            >
              <RotateCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-sky-400' : ''}`} />
              Test Connection
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md transition"
            >
              Save URL
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
