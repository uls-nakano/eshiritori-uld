import { getLogger, isSuccess } from "@eshiritori/shared-kernel";

import type { RandomSource } from "../domain/random/RandomSource";
import { Nickname } from "../domain/room/Nickname";
import { RoomCode } from "../domain/room/RoomCode";
import type { RoomRepository } from "../domain/room/RoomRepository";
import { RoomError } from "../errors/RoomError";
import type { Clock } from "./Clock";
import type { RoomSnapshotDto } from "./RoomSnapshotDto";
import { toRoomSnapshotDto } from "./RoomSnapshotDto";

/**
 * 保存が衝突したときに、部屋を読み直して判断をやり直す回数の上限。
 * 参加の衝突は、ほかの人の書き込みが成功したことを意味する。待機中の部屋で成功しうる書き込みは
 * ほかの人の参加（最大 7 件）と開始（1 件）だけなので、負け続けた要求も 9 回目の読み直しまでに
 * 満員か開始済みで決着する。10 回に届くのは異常とみなす。
 */
const MAX_JOIN_ATTEMPTS = 10;

/** 部屋に入る入力。値の検証は domain が行う。 */
export interface JoinRoomInput {
  readonly roomCode: string;
  readonly nickname: string;
}

/** 部屋に入った結果。トークンはこの応答でだけ返す。 */
export interface JoinRoomOutput {
  readonly room: RoomSnapshotDto;
  /** 加わったメンバーのプレイヤー識別子。 */
  readonly playerId: string;
  /** 加わったメンバーのプレイヤートークン。 */
  readonly playerToken: string;
}

/** 部屋に入る use case（UC-02 要件 2・4〜9）。 */
export class JoinRoom {
  readonly #repository: RoomRepository;
  readonly #random: RandomSource;
  readonly #clock: Clock;

  constructor(repository: RoomRepository, random: RandomSource, clock: Clock) {
    this.#repository = repository;
    this.#random = random;
    this.#clock = clock;
  }

  /**
   * 部屋コードの部屋にニックネームで加わる。
   * 入れなければ RoomError を throw する（domain が throw したものは捕まえずに伝える）。
   */
  async execute(input: JoinRoomInput): Promise<JoinRoomOutput> {
    // 入力だけで決まる誤りは、DB を読む前に返す。部屋コードを先にするのは入力欄の並びに合わせるため
    const code = RoomCode.create(input.roomCode);
    const nickname = Nickname.create(input.nickname);
    // 期限の判断と参加の時刻に同じ値を使う
    const now = this.#clock.now();

    for (let attempt = 1; attempt <= MAX_JOIN_ATTEMPTS; attempt += 1) {
      const room = await this.#repository.findByCode(code);
      if (room === undefined || room.isExpiredAt(now)) {
        getLogger().error("入ろうとした部屋が無いか期限切れです", {
          roomCode: code.value,
          found: room !== undefined,
        });
        throw new RoomError("room_not_found", "Room was not found.");
      }
      const joined = room.join(nickname, now, this.#random);
      const saved = await this.#repository.save(room);
      if (isSuccess(saved)) {
        return {
          room: toRoomSnapshotDto(room),
          playerId: joined.playerId.value,
          playerToken: joined.token.value,
        };
      }
      // 衝突はほかの書き込みが先に成功したということ。読み直して、集約の判断からやり直す
      getLogger().warn("部屋への参加がほかの書き込みと重なったため読み直します", {
        roomCode: code.value,
        attempt,
      });
    }
    getLogger().error("部屋への参加が書き込みの重なりで決まりませんでした", {
      roomCode: code.value,
      attempts: MAX_JOIN_ATTEMPTS,
    });
    throw new Error("Could not join the room after repeated save conflicts.");
  }
}
