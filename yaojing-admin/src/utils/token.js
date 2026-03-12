const TOKEN_KEY = 'west_token';
const ROLE_KEY = 'west_role';
const USER_KEY = 'west_user';
const EXPIRE_KEY = 'west_token_expire';

export function setAuthCache(token, role, user, expiresAt) {
  localStorage.setItem(TOKEN_KEY, token || '');
  localStorage.setItem(ROLE_KEY, role || user?.role || '');
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  localStorage.setItem(EXPIRE_KEY, String(expiresAt || 0));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getRole() {
  return localStorage.getItem(ROLE_KEY) || '';
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getExpireAt() {
  return Number(localStorage.getItem(EXPIRE_KEY) || 0);
}

export function clearAuthCache() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRE_KEY);
}

export function isTokenExpired() {
  const expireAt = getExpireAt();
  if (!expireAt) return true;
  return Date.now() >= expireAt;
}
