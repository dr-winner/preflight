import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

serve({ fetch: app.fetch, hostname: "0.0.0.0", port: config.port }, (info) => {
  const database = config.databaseUrl === undefined ? "unset" : "set";
  console.log(
    `api listening on http://127.0.0.1:${info.port} env=${config.nodeEnv} CELO_NETWORK=${config.celoNetwork} database=${database}`,
  );
});
