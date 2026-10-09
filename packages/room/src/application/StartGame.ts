import type { Result } from "@eshiritori/shared-kernel";
import { failure, getLogger, isFailure, isSuccess, success } from "@eshiritori/shared-kernel";

import type { RandomSource } from "../domain/random/RandomSource";
import { PlayerToken } from "../domain/room/PlayerToken";
import { RoomCode } from "../domain/room/RoomCode";
import type { RoomRepository } from "../domain/room/RoomRepository";
import { RoomError } from "../errors/RoomError";
import type { Clock } from "./Clock";
import type { RoomEventPublisher } from "./RoomEventPublisher";
import type { RoomSnapshotDto } from "./RoomSnapshotDto";
import { toRoomSnapshotDto } from "./RoomSnapshotDto";

/**
 * 保存が衝突したときに、部屋を読み直して判断をやり直す回数の上限。
 * 待機中の部屋で開始と衝突しうる書き込みは、ほかの人の参加（最大 7 件）と別の開始（1 件）だけ。
 * 成功した開始の後は開始済みになり、以後の開始・参加は保存しない。負け続けても 9 回目の読み直しまでに
 * 始まるか開始済みで決着するので、10 回に届くのは異常とみなす。
 */
const MAX_START_ATTEMPTS = 10;

/** ゲームを始める入力。 */
export interface StartGameInput {
  readonly roomCode: string;
  readonly playerToken: string;
}

/** ゲームを始めた結果。既に始まっていた場合も同じ形で、いまの部屋の写しを返す。 */
export interface StartGameOutput {
  readonly room: RoomSnapshotDto;
}

/** ゲームを始める use case（UC-03 要件 4〜6）。 */
export class StartGame {
  readonly #repository: RoomRepository;
  readonly #random: RandomSource;
  readonly #clock: Clock;
  readonly #publisher: RoomEventPublisher;

  constructor(
    repository: RoomRepository,
    random: RandomSource,
    clock: Clock,
    publisher: RoomEventPublisher,
  ) {
    this.#repository = repository;
    this.#random = random;
    this.#clock = clock;
    this.#publisher = publisher;
  }

  /** トークンの持ち主がホストの部屋のゲームを始める。始められなければ RoomError の Result で返す。 */
  async execute(input: StartGameInput): Promise<Result<StartGameOutput, RoomError>> {
    const code = RoomCode.create(input.roomCode);
    if (isFailure(code)) {
      return failure(code.error);
    }
    // 書式は検証しない。持ち主のいないトークンは集約が not_host にする
    const token = PlayerToken.create(input.playerToken);
    // 期限の判断と開始の時刻に同じ値を使う
    const now = this.#clock.now();

    for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt += 1) {
      const room = await this.#repository.findByCode(code.value);
      if (room === undefined || room.isExpiredAt(now)) {
        return failure(new RoomError("room_not_found", "Room was not found."));
      }
      const started = room.start(token, now, this.#random);
      if (isFailure(started)) {
        return failure(started.error);
      }
      if (!started.value) {
        // 既に始まっていた。何も変わっていないので保存せず、いまの部屋を返す
        return success({ room: toRoomSnapshotDto(room) });
      }
      const saved = await this.#repository.save(room);
      if (isSuccess(saved)) {
        const snapshot = toRoomSnapshotDto(room);
        // 保存は済んでいるので、通知の失敗は開始の失敗にしない
        try {
          await this.#publisher.publishGameStarted(snapshot);
        } catch (error) {
          getLogger().warn("ゲームが始まったことの通知に失敗しました", {
            roomCode: code.value.value,
            error,
          });
        }
        return success({ room: snapshot });
      }
      // 衝突はほかの書き込みが先に成功したということ。読み直して、集約の判断からやり直す
      getLogger().warn("ゲームの開始がほかの書き込みと重なったため読み直します", {
        roomCode: code.value.value,
        attempt,
      });
    }
    getLogger().error("ゲームの開始が書き込みの重なりで決まりませんでした", {
      roomCode: code.value.value,
      attempts: MAX_START_ATTEMPTS,
    });
    throw new Error("Could not start the game after repeated save conflicts.");
  }
}
