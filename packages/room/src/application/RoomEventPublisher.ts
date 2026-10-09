import type { RoomSnapshotDto } from "./RoomSnapshotDto";

/** 部屋の変化を、部屋につながっている全員に知らせる口。実装は composition root が注入する。 */
export interface RoomEventPublisher {
  /** メンバーが加わった後の部屋を知らせる。 */
  publishMemberJoined(room: RoomSnapshotDto): Promise<void>;
  /** ゲームが始まった後の部屋（members が描く順番）を知らせる。 */
  publishGameStarted(room: RoomSnapshotDto): Promise<void>;
}
