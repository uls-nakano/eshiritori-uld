import { getLogger } from "@eshiritori/shared-kernel";

import { readApiConfig, startApi } from "./composition";

const api = await startApi(readApiConfig(process.env));

getLogger().info("API サーバーを起動しました", { port: api.port });
