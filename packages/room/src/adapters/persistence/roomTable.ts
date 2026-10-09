import type { CreateTableCommandInput } from "@aws-sdk/client-dynamodb";

/** 部屋の表の定義。部屋コードをそのまま partition key にし、1 部屋 1 項目で持つ。 */
export const roomTable = {
  /** 表の名前の既定値。repository は名前を引数で受け取る（AWS の環境ごとに変えられるように）。 */
  name: "eshiritori-rooms",
  /** 期限切れの項目を DynamoDB が消すときに見る属性（エポック秒）。 */
  timeToLiveAttributeName: "expiresAt",
  /** 表を作るときの入力（表の名前を除く）。 */
  createTableInput: {
    AttributeDefinitions: [{ AttributeName: "roomCode", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "roomCode", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
} as const satisfies {
  name: string;
  timeToLiveAttributeName: string;
  createTableInput: Omit<CreateTableCommandInput, "TableName">;
};
