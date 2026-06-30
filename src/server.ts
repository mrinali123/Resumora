import http from 'http';
import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { connectRedis, disconnectRedis, setRedisAvailable } from './config/redis';
import { verifyEmailSetup } from './config/email';
import { initSocketIO } from './config/socket';
import { closeQueues } from './queue/queues';
import { startWorkers, stopWorkers } from './queue/worker-manager';

const startServer = async (): Promise<void> => {
  // ── Dependency startup ──────────────────────────────────────────────────────
  // DB is critical: fail fast if it's unreachable.
  await prisma.$connect();
  logger.info('Database connection established');

  // Redis is non-critical: server starts without it (caching and queuing disabled).
  const redisAvailable = await connectRedis();
  // Publish the connectivity result so getQueues() can gate on it.
  // This prevents queue.add() from hanging when REDIS_URL is set but Redis is down
  // (BullMQ uses maxRetriesPerRequest: null which retries Redis commands indefinitely).
  setRedisAvailable(redisAvailable);

  // Workers require Redis. Skip them when Redis is unavailable — upload falls back to sync.
  if (redisAvailable) {
    startWorkers();
  } else {
    logger.warn('Skipping BullMQ workers — Redis not available');
  }

  // ── HTTP server ─────────────────────────────────────────────────────────────
  const httpServer = http.createServer(app);
  initSocketIO(httpServer);

  const server = httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, pid: process.pid },
      'Server is listening',
    );
  });

  // Email verification is non-critical and potentially slow (SMTP handshake).
  // Run it after the server is already listening so port binding is never blocked.
  verifyEmailSetup().catch((err) =>
    logger.error({ err }, 'Email setup verification threw unexpectedly'),
  );

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  // Sequence: stop accepting connections → drain in-flight requests →
  //           stop workers (finish current jobs) → close queues → close DB/Redis.
  // This prevents request drops during rolling deployments or container restarts.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received — draining connections');

    server.close(async () => {
      logger.info('HTTP server closed');

      // Stop workers gracefully (they finish current jobs before exiting)
      await stopWorkers();

      await closeQueues();
      await prisma.$disconnect();
      await disconnectRedis();

      logger.info('Clean shutdown complete');
      process.exit(0);
    });

    // Force exit if shutdown takes too long (k8s terminationGracePeriodSeconds)
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection — shutting down');
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception — shutting down');
    process.exit(1);
  });
};

startServer().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
