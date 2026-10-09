import type { CreateTableCommandInput } from "@aws-sdk/client-dynamodb";

/** 接続の表の定義。部屋コードで一度に引けるよう、部屋コードを partition key・接続 ID を sort key にする。 */
export const connectionTable = {
  /** 表の名前の既定値。registry は名前を引数で受け取る（AWS の環境ごとに変えられるように）。 */
  name: "eshiritori-connections",
  /** 切断の記録漏れを掃除するために DynamoDB が見る属性（エポック秒）。 */
  timeToLiveAttributeName: "expiresAt",
  /** 表を作るときの入力（表の名前を除く）。 */
  createTableInput: {
    AttributeDefinitions: [
      { AttributeName: "roomCode", AttributeType: "S" },
      { AttributeName: "connectionId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "roomCode", KeyType: "HASH" },
      { AttributeName: "connectionId", KeyType: "RANGE" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },
} as const satisfies {
  name: string;
  timeToLiveAttributeName: string;
  createTableInput: Omit<CreateTableCommandInput, "TableName">;
};
