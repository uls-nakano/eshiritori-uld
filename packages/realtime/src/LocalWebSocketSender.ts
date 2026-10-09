import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { getLogger } from "@eshiritori/shared-kernel";
import { WebSocket, WebSocketServer } from "ws";

import type { SendOutcome, WebSocketSender } from "./WebSocketSender";

/**
 * ローカル用の WebSocket の受け入れと送信。接続は同じプロセスの中にだけある。
 * HTTP サーバーの生成・URL の解釈・認証・拒否の応答は呼び出し側（composition root）が持つ。
 */
export class LocalWebSocketSender implements WebSocketSender {
  private readonly server = new WebSocketServer({ noServer: true });
  private readonly sockets = new Map<string, WebSocket>();

  /**
   * HTTP の upgrade 要求を WebSocket の接続として受け入れ、新しい接続 ID を返す。
   * 接続が切れたら onClose を 1 回呼ぶ。ハンドシェイクが成り立たずに socket が閉じたら reject する。
   */
  accept(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    onClose: (connectionId: string) => void,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const rejectOnClose = (): void => {
        reject(new Error("WebSocket handshake failed"));
      };
      socket.once("close", rejectOnClose);
      this.server.handleUpgrade(request, socket, head, (webSocket) => {
        socket.off("close", rejectOnClose);
        const connectionId = randomUUID();
        this.sockets.set(connectionId, webSocket);
        webSocket.once("close", () => {
          this.sockets.delete(connectionId);
          onClose(connectionId);
        });
        resolve(connectionId);
      });
    });
  }

  send(connectionId: string, message: string): Promise<SendOutcome> {
    const webSocket = this.sockets.get(connectionId);
    if (webSocket?.readyState !== WebSocket.OPEN) {
      return Promise.resolve("gone");
    }
    return new Promise<SendOutcome>((resolve) => {
      webSocket.send(message, (error) => {
        // ws は成功時に null を渡すため、失敗かどうかは Error かどうかで見分ける
        if (error instanceof Error) {
          getLogger().warn("WebSocket の送信に失敗しました", { connectionId, error });
          resolve("gone");
          return;
        }
        resolve("sent");
      });
    });
  }

  /** 受け入れたすべての接続を閉じる（サーバーの停止・テストの後始末）。 */
  async closeAll(): Promise<void> {
    for (const webSocket of this.sockets.values()) {
      webSocket.close();
    }
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}
