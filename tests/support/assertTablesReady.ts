import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import type { ApiConfig } from "@eshiritori/api";
import { createDynamoDbClient } from "@eshiritori/api";

/** DB の表が使えることを確かめる。使えなければ起動手順を案内して throw する。 */
export async function assertTablesReady(config: ApiConfig): Promise<void> {
  try {
    const client = createDynamoDbClient(config);
    await client.send(new DescribeTableCommand({ TableName: config.roomTableName }));
    await client.send(new DescribeTableCommand({ TableName: config.connectionTableName }));
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    throw new Error(
      `DynamoDB Local に接続できないか、部屋の表か接続の表がありません。\`npm run db:up\` を実行してください（${name}）`,
      { cause: error },
    );
  }
}
