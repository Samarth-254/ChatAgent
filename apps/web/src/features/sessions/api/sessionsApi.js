import { request } from '../../../lib/http.js';

export function fetchSessions() {
  return request('/api/v1/sessions');
}

export function fetchSession(id) {
  return request(`/api/v1/sessions/${id}`);
}

export function renameSession(id, title) {
  return request(`/api/v1/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  });
}

export function deleteSession(id) {
  return request(`/api/v1/sessions/${id}`, {
    method: 'DELETE'
  });
}

