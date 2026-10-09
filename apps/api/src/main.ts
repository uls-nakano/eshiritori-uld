import { getLogger } from "@eshiritori/shared-kernel";
import { serve } from "@hono/node-server";

import { composeApp, readApiConfig } from "./composition";

const config = readApiConfig(process.env);

serve({ fetch: composeApp(config).fetch, port: config.port }, () => {
  getLogger().info("API サーバーを起動しました", { port: config.port });
});
