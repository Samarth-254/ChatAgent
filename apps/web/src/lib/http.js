import { getAuthHeaders } from './clientId.js';

export async function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let errorData = null;
    try {
      errorData = await response.json();
    } catch {}
    const message = errorData?.error?.message || `Request failed with HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = errorData;
    throw err;
  }

  return response.json();
}

