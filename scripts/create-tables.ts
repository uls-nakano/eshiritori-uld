import {
  CreateTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  ListTablesCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import { roomTable } from "@eshiritori/room";

const client = new DynamoDBClient({
  endpoint: process.env["DYNAMODB_ENDPOINT"] ?? "http://localhost:8000",
  region: "ap-northeast-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

/** 作る表の定義の一覧。表を足す段はここに加える。 */
const tables = [roomTable];

/** DynamoDB Local が応答するまで待ち、既存の表の名前を返す。応答しなければ起動手順を案内して終了する。 */
async function waitForDatabase(): Promise<string[]> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const output = await client.send(new ListTablesCommand({}));
      return output.TableNames ?? [];
    } catch (error) {
      if (attempt >= 20) {
        console.error(
          "DynamoDB Local に接続できません。`docker compose up -d dynamodb` で起動したか確かめてください。",
          error,
        );
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

const existing = await waitForDatabase();
for (const table of tables) {
  if (existing.includes(table.name)) {
    console.log(`表 ${table.name} は作成済みです`);
  } else {
    await client.send(new CreateTableCommand({ TableName: table.name, ...table.createTableInput }));
    console.log(`表 ${table.name} を作成しました`);
  }
  // 作成直後に失敗しても再実行で直るよう、期限の設定は表の有無に関わらず確かめる
  const ttl = await client.send(new DescribeTimeToLiveCommand({ TableName: table.name }));
  const status = ttl.TimeToLiveDescription?.TimeToLiveStatus;
  if (status === "ENABLED" || status === "ENABLING") {
    continue;
  }
  await client.send(
    new UpdateTimeToLiveCommand({
      TableName: table.name,
      TimeToLiveSpecification: {
        AttributeName: table.timeToLiveAttributeName,
        Enabled: true,
      },
    }),
  );
}
