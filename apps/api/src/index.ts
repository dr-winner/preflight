import { serve } from "@hono/node-server";
import { createApp, signerFromConfig } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const signer = signerFromConfig(config);
const app = createApp(config, {
  ...(signer === undefined ? {} : { signer }),
  syncFacilitatorOnStart: true,
});

serve({ fetch: app.fetch, hostname: "0.0.0.0", port: config.port }, (info) => {
  const database = config.databaseUrl === undefined ? "unset" : "set";
  console.log(
    `api listening on http://127.0.0.1:${info.port} env=${config.nodeEnv} network=${config.network.network} chainId=${config.network.table.chainId} database=${database}`,
  );
});
