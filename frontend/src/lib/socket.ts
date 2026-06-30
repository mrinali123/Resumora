import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;

function getBackendOrigin(): string {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3000/api/v1';
  return url.replace('/api/v1', '');
}

export function connectSocket(token: string): Socket {
  if (_socket?.connected) return _socket;

  _socket = io(getBackendOrigin(), {
    auth: { token },
    transports: ['polling', 'websocket'],
    path: '/socket.io',
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  return _socket;
}

export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}

export function getSocket(): Socket | null {
  return _socket;
}
