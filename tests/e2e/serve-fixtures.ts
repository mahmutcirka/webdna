/**
 * Serves deterministic fixture sites on fixed loopback ports for the Playwright E2E suite.
 *   4561 → basic-landing (also /__slow for cancellation tests)
 *   4562 → generator-marker
 */
import { startFixtureServer } from "../integration/fixture-server.js";

const servers = await Promise.all([
  startFixtureServer("basic-landing", 4561),
  startFixtureServer("generator-marker", 4562),
]);
console.log(`fixtures ready: ${servers.map((s) => s.url).join(", ")}`);

const stop = () => void Promise.all(servers.map((s) => s.close())).then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
