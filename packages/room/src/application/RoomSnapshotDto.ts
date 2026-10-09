import type { Room } from "../domain/room/Room";

/** API に返すメンバーの写し。トークンは含めない。 */
export interface MemberDto {
  readonly playerId: string;
  readonly nickname: string;
}

/** API に返す部屋の写し。ホストの印は hostPlayerId で表す。 */
export interface RoomSnapshotDto {
  readonly code: string;
  readonly roundCount: number;
  readonly hostPlayerId: string;
  /** 進行状態。started のとき members の並びが描く順番。 */
  readonly status: "waiting" | "started";
  readonly members: readonly MemberDto[];
}

/** 部屋の集約から、API に返す写しを作る。メンバーの並びは集約の並びを保つ。 */
export function toRoomSnapshotDto(room: Room): RoomSnapshotDto {
  return {
    code: room.code.value,
    roundCount: room.roundCount.value,
    hostPlayerId: room.hostPlayerId.value,
    status: room.status.hasStarted() ? "started" : "waiting",
    members: room.members.map((member) => ({
      playerId: member.playerId.value,
      nickname: member.nickname.value,
    })),
  };
}
