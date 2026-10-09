/** 部屋ごとに、このブラウザのプレイヤートークンを覚えておく口。 */
export interface PlayerTokenStore {
  /** その部屋のトークン。無ければ undefined。 */
  load(roomCode: string): string | undefined;
  save(roomCode: string, playerToken: string): void;
  remove(roomCode: string): void;
}

const keyOf = (roomCode: string): string => `eshiritori.playerToken.${roomCode}`;

/** 記憶域（既定は localStorage）に、部屋コードごとのキーで保存する。記憶域が使えないときは何も覚えない。 */
export function createPlayerTokenStore(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): PlayerTokenStore {
  return {
    load(roomCode) {
      try {
        return storage.getItem(keyOf(roomCode)) ?? undefined;
      } catch {
        return undefined;
      }
    },
    save(roomCode, playerToken) {
      try {
        storage.setItem(keyOf(roomCode), playerToken);
      } catch {
        // 保存できないブラウザでは、開き直したときに参加画面が出る
      }
    },
    remove(roomCode) {
      try {
        storage.removeItem(keyOf(roomCode));
      } catch {
        // 消せなくても画面の動きは変えない
      }
    },
  };
}
