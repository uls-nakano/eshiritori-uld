import type { Result } from "@eshiritori/shared-kernel";

import type { Room } from "./Room";
import type { RoomCode } from "./RoomCode";

/** 保存の条件が満たされず、書き込まなかったことを表す印。利用者に返す失敗ではなく、use case がやり直す合図。 */
export type RoomSaveConflict = "save_conflict";

/** 部屋リポジトリ。部屋の集約を部屋コードで保存・復元する port。 */
export interface RoomRepository {
  /** 部屋コードの部屋を復元する。無ければ undefined。期限切れの部屋も返す。 */
  findByCode(code: RoomCode): Promise<Room | undefined>;
  /** 読んだときの改訂番号を条件に保存する（新しい部屋は同じ部屋コードが無いときだけ）。条件が外れたら書き込まず RoomSaveConflict を返す。 */
  save(room: Room): Promise<Result<void, RoomSaveConflict>>;
}
