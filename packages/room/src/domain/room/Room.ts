import { getLogger } from "@eshiritori/shared-kernel";

import { RoomError } from "../../errors/RoomError";
import type { RandomSource } from "../random/RandomSource";
import { Member } from "./Member";
import type { Nickname } from "./Nickname";
import type { PlayerId } from "./PlayerId";
import type { PlayerToken } from "./PlayerToken";
import { Revision } from "./Revision";
import { RoomCode } from "./RoomCode";
import { RoomStatus } from "./RoomStatus";
import type { RoundCount } from "./RoundCount";

/** 部屋に入れるメンバーの上限（UC-02）。 */
const MAX_MEMBERS = 8;
/** ゲームを始められる最少人数（UC-03）。 */
const MIN_MEMBERS_TO_START = 2;
/** 最後に更新してから期限切れになるまでの時間（ミリ秒）。 */
const ROOM_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1000;

/** 部屋を復元するための値。 */
export interface RoomSnapshot {
  readonly code: RoomCode;
  readonly members: readonly Member[];
  readonly hostPlayerId: PlayerId;
  readonly roundCount: RoundCount;
  readonly status: RoomStatus;
  readonly lastUpdatedAt: Date;
  readonly revision: Revision;
}

/** 部屋。メンバー・ホスト・進行状態を持ち、入れるか・始められるかを判断する集約ルート。 */
export class Room {
  readonly #code: RoomCode;
  #members: readonly Member[];
  readonly #hostPlayerId: PlayerId;
  readonly #roundCount: RoundCount;
  #status: RoomStatus;
  #lastUpdatedAt: Date;
  readonly #revision: Revision;

  private constructor(snapshot: RoomSnapshot) {
    this.#code = snapshot.code;
    this.#members = [...snapshot.members];
    this.#hostPlayerId = snapshot.hostPlayerId;
    this.#roundCount = snapshot.roundCount;
    this.#status = snapshot.status;
    this.#lastUpdatedAt = new Date(snapshot.lastUpdatedAt.getTime());
    this.#revision = snapshot.revision;
  }

  /** 新しい部屋を作る。作った人がホストで、ただ 1 人のメンバーになる。 */
  static create(
    hostNickname: Nickname,
    roundCount: RoundCount,
    now: Date,
    random: RandomSource,
  ): Room {
    const code = RoomCode.generate(random);
    const host = Member.create(hostNickname, random);
    return new Room({
      code,
      members: [host],
      hostPlayerId: host.playerId,
      roundCount,
      status: RoomStatus.waiting(),
      lastUpdatedAt: now,
      revision: Revision.initial(),
    });
  }

  /** 保存された値から復元する。ホストがメンバーの 1 人でなければ Error を投げる。 */
  static restore(snapshot: RoomSnapshot): Room {
    if (!snapshot.members.some((m) => m.playerId.equals(snapshot.hostPlayerId))) {
      getLogger().error("復元する部屋のホストがメンバーにいません", {
        roomCode: snapshot.code.value,
        hostPlayerId: snapshot.hostPlayerId.value,
      });
      throw new Error("Room host must be one of the members.");
    }
    return new Room(snapshot);
  }

  /** 部屋に入る。入れなければ RoomError を throw する。 */
  join(nickname: Nickname, now: Date, random: RandomSource): Member {
    if (this.#status.hasStarted()) {
      getLogger().error("ゲームが始まった部屋には入れません", { roomCode: this.#code.value });
      throw new RoomError("game_already_started", "The game has already started.");
    }
    if (this.#members.length >= MAX_MEMBERS) {
      getLogger().error("満員の部屋には入れません", {
        roomCode: this.#code.value,
        memberCount: this.#members.length,
      });
      throw new RoomError("room_full", "The room is full.");
    }
    if (this.#members.some((m) => m.isNamed(nickname))) {
      getLogger().error("同じニックネームのメンバーがいます", {
        roomCode: this.#code.value,
        nickname: nickname.value,
      });
      throw new RoomError("nickname_taken", "The nickname is already taken.");
    }
    const member = Member.create(nickname, random);
    this.#members = [...this.#members, member];
    this.#lastUpdatedAt = new Date(now.getTime());
    return member;
  }

  /** トークンの持ち主のメンバー。いなければ undefined。 */
  findMember(token: PlayerToken): Member | undefined {
    return this.#members.find((m) => m.isHeldBy(token));
  }

  /**
   * ゲームを始める。今回の要求で始まったら true、既に始まっていれば false。
   * ホストでない人の要求と、人数が足りない場合は RoomError を throw する。
   */
  start(requesterToken: PlayerToken, now: Date, random: RandomSource): boolean {
    const requester = this.findMember(requesterToken);
    if (requester === undefined || !requester.playerId.equals(this.#hostPlayerId)) {
      getLogger().error("ホストでない人がゲームを始めようとしました", {
        roomCode: this.#code.value,
        requesterPlayerId: requester?.playerId.value,
      });
      throw new RoomError("not_host", "Only the host can start the game.");
    }
    if (this.#status.hasStarted()) {
      return false;
    }
    if (this.#members.length < MIN_MEMBERS_TO_START) {
      getLogger().error("人数が足りないのでゲームを始められません", {
        roomCode: this.#code.value,
        memberCount: this.#members.length,
      });
      throw new RoomError("not_enough_members", "At least 2 members are required.");
    }
    this.#members = shuffle(this.#members, random);
    this.#status = RoomStatus.started();
    this.#lastUpdatedAt = new Date(now.getTime());
    return true;
  }

  /** 最後の更新から 24 時間以上たっているか。 */
  isExpiredAt(now: Date): boolean {
    return now.getTime() - this.#lastUpdatedAt.getTime() >= ROOM_LIFETIME_MILLISECONDS;
  }

  /** 部屋コード。 */
  get code(): RoomCode {
    return this.#code;
  }

  /** メンバー。開始前は入った順、開始後は描く順。 */
  get members(): readonly Member[] {
    return this.#members;
  }

  /** ホストのプレイヤー識別子。 */
  get hostPlayerId(): PlayerId {
    return this.#hostPlayerId;
  }

  /** ホストのメンバー。 */
  get host(): Member {
    const host = this.#members.find((m) => m.playerId.equals(this.#hostPlayerId));
    /* v8 ignore next 7 -- defensive: create と restore が「ホストはメンバーの 1 人」を保証する */
    if (host === undefined) {
      getLogger().error("部屋のホストがメンバーにいません", {
        roomCode: this.#code.value,
        hostPlayerId: this.#hostPlayerId.value,
      });
      throw new Error("Room host must be one of the members.");
    }
    return host;
  }

  /** 周回数。 */
  get roundCount(): RoundCount {
    return this.#roundCount;
  }

  /** 進行状態。 */
  get status(): RoomStatus {
    return this.#status;
  }

  /** 最後に更新された時刻（写し）。 */
  get lastUpdatedAt(): Date {
    return new Date(this.#lastUpdatedAt.getTime());
  }

  /** 改訂番号。 */
  get revision(): Revision {
    return this.#revision;
  }
}

/** 残りから 1 人ずつ引いて並べ替える（Fisher–Yates と同じ分布）。 */
function shuffle(members: readonly Member[], random: RandomSource): readonly Member[] {
  const remaining = [...members];
  const result: Member[] = [];
  while (remaining.length >= 2) {
    result.push(...remaining.splice(random.nextInt(remaining.length), 1));
  }
  result.push(...remaining);
  return result;
}
