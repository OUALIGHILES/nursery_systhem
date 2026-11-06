import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module.js";

/**
 * Worker bootstrap (separate Nest application context, no HTTP server).
 *
 * Run via: `npm run start:worker` (node dist/worker/main) or
 * `npm run start:worker:dev` (built-in watch). Env is loaded from
 * `apps/api/.env` (or process env). `enableShutdownHooks()` plus
 * SIGTERM/SIGINT handlers guarantee consumers and the relay stop
 * before the process exits.
 */
async function bootstrap() {
  const logger = new Logger("WorkerBootstrap");
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  const shutdown = async (signal: string) => {
    logger.log(`worker.shutdown_requested {signal: "${signal}"}`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  logger.log("worker.bootstrap.complete {process: \"worker\"}");
}

await bootstrap();
