import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { toast } from 'sonner';

const AppContext = createContext(null);

const STORAGE_CUSTOMERS_KEY = 'paybridge_saved_customers';
const STORAGE_SELECTED_CUST_KEY = 'paybridge_selected_customer_id';

export function AppProvider({ children }) {
  const [customers, setCustomers] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CUSTOMERS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_SELECTED_CUST_KEY) || '';
    } catch {
      return '';
    }
  });

  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [limits, setLimits] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [statement, setStatement] = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // How many times in a row loading the selected customer's data has failed (0 = last load worked).
  // The free Render backend sleeps when idle, so the first load after a pause often fails.
  const [loadFailures, setLoadFailures] = useState(0);

  // Sync customers to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CUSTOMERS_KEY, JSON.stringify(customers));
    } catch (e) {
      console.error('Failed to save customers to local storage', e);
    }
  }, [customers]);

  // Sync selectedCustomerId to localStorage
  useEffect(() => {
    try {
      if (selectedCustomerId) {
        localStorage.setItem(STORAGE_SELECTED_CUST_KEY, selectedCustomerId);
      }
    } catch (e) {
      console.error('Failed to save selected customer', e);
    }
  }, [selectedCustomerId]);

  // Check backend health periodically
  const checkHealth = useCallback(async () => {
    try {
      const res = await api.checkHealth();
      setBackendOnline(res?.status === 'UP');
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Load customer data when selected customer changes
  const refreshCustomerData = useCallback(async (customCustId = null) => {
    const custId = customCustId || selectedCustomerId;
    if (!custId) {
      setAccounts([]);
      setSelectedAccountId('');
      setLimits(null);
      setNotifications([]);
      setStatement([]);
      setLoadFailures(0);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch customer fresh details
      try {
        const freshCust = await api.getCustomer(custId);
        setCustomers((prev) => {
          const exists = prev.some((c) => c.id === freshCust.id);
          if (exists) {
            return prev.map((c) => (c.id === freshCust.id ? freshCust : c));
          }
          return [freshCust, ...prev];
        });
      } catch (err) {
        console.warn('Customer lookup warning:', err.message);
        // If customer doesn't exist in active database (e.g. leftover from local Docker), purge stale entry
        if (err.status === 404 || err.code === 'RESOURCE_NOT_FOUND') {
          console.warn(`Customer ${custId} not found on backend (404). Cleaning stale cached customer.`);
          setCustomers((prev) => {
            const updated = prev.filter((c) => c.id !== custId);
            try {
              localStorage.setItem(STORAGE_CUSTOMERS_KEY, JSON.stringify(updated));
            } catch (e) {
              console.error(e);
            }
            return updated;
          });
          if (selectedCustomerId === custId) {
            setSelectedCustomerId('');
            try {
              localStorage.removeItem(STORAGE_SELECTED_CUST_KEY);
            } catch (e) {
              console.error(e);
            }
          }
          setAccounts([]);
          setSelectedAccountId('');
          setLimits(null);
          setNotifications([]);
          setStatement([]);
          setLoadFailures(0);
          return;
        }
      }

      // Fetch accounts
      const accs = await api.listAccountsForCustomer(custId);
      setAccounts(accs || []);
      setLoadFailures(0);

      // If no account selected or current selection is not in list, select first
      setSelectedAccountId((prev) => {
        if (accs && accs.length > 0) {
          const match = accs.find((a) => a.id === prev);
          return match ? match.id : accs[0].id;
        }
        return '';
      });

      // Fetch compliance limits
      try {
        const lim = await api.getLimits(custId);
        setLimits(lim);
      } catch (err) {
        console.warn('Limits lookup error:', err.message);
      }

      // Fetch notifications
      try {
        const notifs = await api.getNotifications(custId);
        setNotifications(notifs || []);
      } catch (err) {
        console.warn('Notifications lookup error:', err.message);
      }
    } catch (err) {
      console.error('Failed to load customer details:', err);
      setLoadFailures((n) => n + 1);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    if (selectedCustomerId) {
      refreshCustomerData();
    }
  }, [selectedCustomerId, refreshCustomerData]);

  // Retry a failed load every 8 seconds (up to 6 times), so a sleeping backend that wakes up fills the page in by itself.
  useEffect(() => {
    if (loadFailures === 0 || loadFailures >= 6 || !selectedCustomerId) return undefined;
    const timer = setTimeout(() => refreshCustomerData(), 8000);
    return () => clearTimeout(timer);
  }, [loadFailures, selectedCustomerId, refreshCustomerData]);

  // As soon as the backend reports UP after a failed load, retry straight away instead of waiting for the timer.
  useEffect(() => {
    if (backendOnline && loadFailures > 0 && selectedCustomerId) {
      refreshCustomerData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendOnline]);

  // Load statements when selected account changes
  const refreshStatement = useCallback(async (customAccId = null) => {
    const accId = customAccId || selectedAccountId;
    if (!accId) {
      setStatement([]);
      return;
    }
    try {
      const entries = await api.getStatement(accId, 50);
      setStatement(entries || []);
    } catch (err) {
      console.warn('Statement fetch error:', err.message);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (selectedAccountId) {
      refreshStatement();
    }
  }, [selectedAccountId, refreshStatement]);

  // Helper actions
  const addOrUpdateCustomer = (cust) => {
    setCustomers((prev) => {
      const idx = prev.findIndex((c) => c.id === cust.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = cust;
        return copy;
      }
      return [cust, ...prev];
    });
    setSelectedCustomerId(cust.id);
  };

  const clearStoredData = useCallback(async (resetBackend = false) => {
    try {
      localStorage.removeItem(STORAGE_CUSTOMERS_KEY);
      localStorage.removeItem(STORAGE_SELECTED_CUST_KEY);
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
    setCustomers([]);
    setSelectedCustomerId('');
    setAccounts([]);
    setSelectedAccountId('');
    setLimits(null);
    setNotifications([]);
    setStatement([]);
    setLoadFailures(0);

    if (resetBackend) {
      try {
        await api.resetAllDevData();
        toast.success('Database & Accounts Reset', {
          description: 'All customer bank accounts, ledger entries, and customers cleared from database.',
        });
        return;
      } catch (err) {
        console.warn('Backend reset call warning:', err);
      }
    }
    toast.info('Local cached accounts cleared', { description: 'Select or register a new customer on the current backend.' });
  }, []);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || null;

  return (
    <AppContext.Provider
      value={{
        customers,
        selectedCustomerId,
        selectedCustomer,
        setSelectedCustomerId,
        accounts,
        selectedAccountId,
        selectedAccount,
        setSelectedAccountId,
        limits,
        notifications,
        statement,
        backendOnline,
        isLoading,
        accountsLoadFailed: loadFailures > 0,
        checkHealth,
        refreshCustomerData,
        refreshStatement,
        addOrUpdateCustomer,
        setCustomers,
        clearStoredData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
