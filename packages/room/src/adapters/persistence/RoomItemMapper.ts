import { getLogger, isFailure } from "@eshiritori/shared-kernel";

import { Member } from "../../domain/room/Member";
import { Nickname } from "../../domain/room/Nickname";
import { PlayerId } from "../../domain/room/PlayerId";
import { PlayerToken } from "../../domain/room/PlayerToken";
import { Revision } from "../../domain/room/Revision";
import { Room } from "../../domain/room/Room";
import { RoomCode } from "../../domain/room/RoomCode";
import { RoomStatus } from "../../domain/room/RoomStatus";
import { RoundCount } from "../../domain/room/RoundCount";

/** 部屋が最後の更新から期限切れになるまでの時間（ミリ秒）。ドメインの 24 時間と同じ値で、テストが突き合わせる。 */
const ROOM_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1000;

/** 表に保存する項目のメンバー。 */
interface RoomItemMember {
  playerId: string;
  token: string;
  nickname: string;
}

/** 表に保存する部屋の項目。 */
export interface RoomItem {
  roomCode: string;
  members: RoomItemMember[];
  hostPlayerId: string;
  roundCount: number;
  status: "waiting" | "started";
  lastUpdatedAt: string;
  revision: number;
  expiresAt: number;
}

/** unknown が object（null を除く）として属性を読めるか。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 項目のメンバーの形（3 つの文字列）を満たすか。 */
function isMember(value: unknown): value is RoomItemMember {
  return (
    isRecord(value) &&
    typeof value["playerId"] === "string" &&
    typeof value["token"] === "string" &&
    typeof value["nickname"] === "string"
  );
}

/** 項目の形が正しくないことを記録して throw する。 */
function failItem(item: unknown, attribute: string): never {
  const roomCode =
    isRecord(item) && typeof item["roomCode"] === "string" ? item["roomCode"] : undefined;
  getLogger().error("保存された部屋の項目の形が正しくありません", { roomCode, attribute });
  throw new Error(`Stored room item is invalid: ${attribute}`);
}

/** 形を確かめて項目として読む。外れた属性があれば記録して Error を投げる。 */
function readItem(item: unknown): Omit<RoomItem, "expiresAt"> {
  if (!isRecord(item)) {
    return failItem(item, "item");
  }
  const { roomCode, members, hostPlayerId, roundCount, status, lastUpdatedAt, revision } = item;
  if (typeof roomCode !== "string") {
    return failItem(item, "roomCode");
  }
  if (!Array.isArray(members)) {
    return failItem(item, "members");
  }
  const readMembers: RoomItemMember[] = [];
  for (const member of members) {
    if (!isMember(member)) {
      return failItem(item, "members.member");
    }
    readMembers.push(member);
  }
  if (typeof hostPlayerId !== "string") {
    return failItem(item, "hostPlayerId");
  }
  if (typeof roundCount !== "number") {
    return failItem(item, "roundCount");
  }
  if (status !== "waiting" && status !== "started") {
    return failItem(item, "status");
  }
  if (typeof lastUpdatedAt !== "string") {
    return failItem(item, "lastUpdatedAt");
  }
  if (typeof revision !== "number") {
    return failItem(item, "revision");
  }
  return {
    roomCode,
    members: readMembers,
    hostPlayerId,
    roundCount,
    status,
    lastUpdatedAt,
    revision,
  };
}

/** 部屋の集約と、表の項目を相互に写す。 */
export class RoomItemMapper {
  /** 集約を項目にする。`revision` は書き込む改訂番号。 */
  toItem(room: Room, revision: Revision): RoomItem {
    const lastUpdatedAt = room.lastUpdatedAt;
    return {
      roomCode: room.code.value,
      members: room.members.map((member) => ({
        playerId: member.playerId.value,
        token: member.token.value,
        nickname: member.nickname.value,
      })),
      hostPlayerId: room.hostPlayerId.value,
      roundCount: room.roundCount.value,
      status: room.status.hasStarted() ? "started" : "waiting",
      lastUpdatedAt: lastUpdatedAt.toISOString(),
      revision: revision.value,
      expiresAt: Math.ceil((lastUpdatedAt.getTime() + ROOM_LIFETIME_MILLISECONDS) / 1000),
    };
  }

  /** 項目から集約を復元する。形や値が正しくなければ記録して Error を投げる。 */
  toRoom(item: unknown): Room {
    const stored = readItem(item);

    const code = RoomCode.create(stored.roomCode);
    if (isFailure(code)) {
      return failItem(item, "roomCode");
    }
    const roundCount = RoundCount.create(stored.roundCount);
    if (isFailure(roundCount)) {
      return failItem(item, "roundCount");
    }
    const lastUpdatedAt = new Date(stored.lastUpdatedAt);
    if (Number.isNaN(lastUpdatedAt.getTime())) {
      return failItem(item, "lastUpdatedAt");
    }
    const members = stored.members.map((member) => {
      const nickname = Nickname.create(member.nickname);
      if (isFailure(nickname)) {
        return failItem(item, "members.nickname");
      }
      return Member.restore(
        PlayerId.create(member.playerId),
        PlayerToken.create(member.token),
        nickname.value,
      );
    });

    return Room.restore({
      code: code.value,
      members,
      hostPlayerId: PlayerId.create(stored.hostPlayerId),
      roundCount: roundCount.value,
      status: stored.status === "started" ? RoomStatus.started() : RoomStatus.waiting(),
      lastUpdatedAt,
      revision: Revision.restore(stored.revision),
    });
  }
}
