import { io } from 'socket.io-client';

let socket;

function resolveSocketUrl() {
  const explicit = String(import.meta.env.VITE_SOCKET_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const apiBase = String(import.meta.env.VITE_API_BASE_URL || '/api').trim();
  if (/^https?:\/\//.test(apiBase)) {
    return apiBase.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }

  return window.location.origin;
}

export function connectSocket(token) {
  if (socket?.connected) {
    return socket;
  }

  socket = io(resolveSocketUrl(), {
    transports: ['websocket'],
    auth: {
      token,
    },
    autoConnect: true,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}
