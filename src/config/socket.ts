import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyToken } from '../utils/jwt';
import { env } from './env';
import { logger } from '../utils/logger';

let _io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  _io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    },
    path: '/socket.io',
    transports: ['polling', 'websocket'],
  });

  // JWT auth middleware — reject unauthenticated sockets
  _io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  _io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    logger.info({ userId, socketId: socket.id }, 'WebSocket connected');

    socket.on('disconnect', (reason) => {
      logger.info({ userId, socketId: socket.id, reason }, 'WebSocket disconnected');
    });
  });

  logger.info('Socket.io server initialised');
  return _io;
}

export function getIO(): SocketIOServer | null {
  return _io;
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  _io?.to(`user:${userId}`).emit(event, data);
}
