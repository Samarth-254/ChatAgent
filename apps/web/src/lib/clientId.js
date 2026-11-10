import { CLIENT_ID_HEADER } from '@chatagent/shared';

const CLIENT_ID_KEY = 'chatagent_client_id';

export function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getAuthHeaders() {
  return {
    [CLIENT_ID_HEADER]: getClientId()
  };
}

