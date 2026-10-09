/** 送った結果。gone は接続がもう無い（切れた・知らない接続 ID）ことを表し、呼び出し側は登録を消す。 */
export type SendOutcome = "sent" | "gone";

/** 接続 ID を宛先に WebSocket で文字列を送る口。ローカルと AWS で実装を差し替える。 */
export interface WebSocketSender {
  send(connectionId: string, message: string): Promise<SendOutcome>;
}
