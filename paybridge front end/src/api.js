export const DEFAULT_BACKEND_URL = 'https://paybridge-zkvm.onrender.com';

export function getBaseUrl() {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('paybridge_backend_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  const envUrl = import.meta.env?.VITE_API_BASE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return DEFAULT_BACKEND_URL;
}

export function setCustomBaseUrl(url) {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('paybridge_backend_url', url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('paybridge_backend_url');
    }
  }
}

export class ApiError extends Error {
  constructor(message, status, data, requestId) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = data?.code || 'ERROR';
    this.detail = data?.detail || message;
    this.requestId = requestId || data?.requestId || null;
  }
}

async function request(path, options = {}) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const requestId = response.headers.get('X-Request-Id');
    const isReplayed = response.headers.get('Idempotent-Replayed') === 'true';

    let data = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message = (typeof data === 'object' && data?.detail) 
        ? data.detail 
        : `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, data, requestId);
    }

    return {
      data,
      status: response.status,
      headers: response.headers,
      isReplayed,
      requestId,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      err.message || 'Network connection failed. Is the PayBridge backend running on port 8080?',
      0,
      { code: 'NETWORK_ERROR', detail: err.message },
      null
    );
  }
}

// Formatters
export function formatMoney(koboAmount, currency = 'NGN') {
  if (koboAmount === null || koboAmount === undefined) return '₦0.00';
  const naira = Number(koboAmount) / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(naira);
}

export function nairaToKobo(naira) {
  if (!naira && naira !== 0) return 0;
  return Math.round(parseFloat(naira) * 100);
}

export function generateIdempotencyKey(prefix = 'req') {
  const rand = Math.floor(1000 + Math.random() * 9000);
  const time = Date.now().toString().slice(-4);
  return `${prefix}-${rand}-${time}`;
}

export const api = {
  // Health
  checkHealth: async () => {
    const res = await request('/actuator/health');
    return res.data;
  },

  wakeBackend: async (timeoutMs = 60000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await request('/actuator/health', { signal: controller.signal });
      clearTimeout(timer);
      return res.data;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  },

  // Customers
  createCustomer: async (payload) => {
    const res = await request('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  getCustomer: async (id) => {
    const res = await request(`/api/customers/${id}`);
    return res.data;
  },

  updateKycTier: async (id, kycTier) => {
    const res = await request(`/api/customers/${id}/kyc-tier`, {
      method: 'PATCH',
      body: JSON.stringify({ kycTier }),
    });
    return res.data;
  },

  // Accounts
  openAccount: async (customerId, currency = 'NGN') => {
    const res = await request('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ customerId, currency }),
    });
    return res.data;
  },

  getAccount: async (id) => {
    const res = await request(`/api/accounts/${id}`);
    return res.data;
  },

  getAccountByNumber: async (accountNumber) => {
    const res = await request(`/api/accounts/by-number/${accountNumber}`);
    return res.data;
  },

  listAccountsForCustomer: async (customerId) => {
    const res = await request(`/api/accounts?customerId=${customerId}`);
    return res.data;
  },

  // Dev Operations
  fundAccount: async (accountId, amountMinor) => {
    const res = await request(`/api/dev/accounts/${accountId}/fund`, {
      method: 'POST',
      body: JSON.stringify({ amountMinor }),
    });
    return res.data;
  },

  resetAllDevData: async () => {
    const res = await request('/api/dev/reset', {
      method: 'POST',
    });
    return res.data;
  },

  // Internal Transfers
  transferInternal: async (payload, idempotencyKey) => {
    const res = await request('/api/transfers/internal', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    return {
      transfer: res.data,
      isReplayed: res.isReplayed,
      status: res.status,
    };
  },

  getTransfer: async (id) => {
    const res = await request(`/api/transfers/${id}`);
    return res.data;
  },

  listTransfersForAccount: async (accountId, limit = 50) => {
    const res = await request(`/api/transfers?accountId=${accountId}&limit=${limit}`);
    return res.data;
  },

  // Beneficiaries & External Transfers
  resolveBeneficiary: async (bankCode, accountNumber) => {
    const res = await request('/api/beneficiaries/resolve', {
      method: 'POST',
      body: JSON.stringify({ bankCode, accountNumber }),
    });
    return res.data;
  },

  createBeneficiary: async (customerId, bankCode, accountNumber) => {
    const res = await request('/api/beneficiaries', {
      method: 'POST',
      body: JSON.stringify({ customerId, bankCode, accountNumber }),
    });
    return res.data;
  },

  listBeneficiaries: async (customerId) => {
    const res = await request(`/api/beneficiaries?customerId=${customerId}`);
    return res.data;
  },

  transferExternal: async (payload, idempotencyKey) => {
    const res = await request('/api/transfers/external', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    return {
      transfer: res.data,
      isReplayed: res.isReplayed,
      status: res.status,
    };
  },

  // Statements & Global Ledger
  getStatement: async (accountId, limit = 50) => {
    const res = await request(`/api/accounts/${accountId}/entries?limit=${limit}`);
    return res.data;
  },

  getAllLedgerEntries: async (limit = 100) => {
    const res = await request(`/api/accounts/entries?limit=${limit}`);
    return res.data;
  },

  // Compliance
  getLimits: async (customerId) => {
    const res = await request(`/api/compliance/customers/${customerId}/limits`);
    return res.data;
  },

  // Notifications
  getNotifications: async (customerId, limit = 50) => {
    const res = await request(`/api/notifications?customerId=${customerId}&limit=${limit}`);
    return res.data;
  },
};
