import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const { app, store, queue } = await buildApp({ config, logger: true });

if (config.unsafeAllowLoopback.length > 0) {
  app.log.warn(
    `WEBDNA_UNSAFE_ALLOW_LOOPBACK is set (${config.unsafeAllowLoopback.join(", ")}). Do not run like this on a shared host.`,
  );
}
if (config.host !== "127.0.0.1" && config.host !== "localhost" && config.host !== "::1") {
  app.log.warn(
    `Listening on ${config.host}. WebDNA has no authentication; put it behind an authenticating proxy before exposing it.`,
  );
}

const interrupted = await store.markInterrupted();
if (interrupted > 0) app.log.info(`Marked ${interrupted} interrupted scan(s) as failed.`);

const retention = async () => {
  const removed = await store.applyRetention(config.retentionDays, (id) => queue.isActive(id));
  if (removed > 0)
    app.log.info(`Retention: deleted ${removed} scan(s) older than ${config.retentionDays} days.`);
};
await retention();
const timer = setInterval(() => void retention(), 3_600_000);
timer.unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: config.host, port: config.port });
