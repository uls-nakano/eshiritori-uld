import type { Result } from "@eshiritori/shared-kernel";
import { failure, getLogger, isFailure, isSuccess, success } from "@eshiritori/shared-kernel";

import type { RandomSource } from "../domain/random/RandomSource";
import { Nickname } from "../domain/room/Nickname";
import { Room } from "../domain/room/Room";
import type { RoomRepository } from "../domain/room/RoomRepository";
import { RoundCount } from "../domain/room/RoundCount";
import type { RoomError } from "../errors/RoomError";
import type { Clock } from "./Clock";
import type { RoomSnapshotDto } from "./RoomSnapshotDto";
import { toRoomSnapshotDto } from "./RoomSnapshotDto";

/**
 * 部屋コードが重なったときに、部屋を作り直して保存する回数の上限。
 * 部屋コードは 36^6 通りあるので、3 回続く重なりは偶然ではなく乱数の源の故障とみなす。
 * 回数を増やして粘る選択はしない（故障を隠して遅くなるだけ）。
 */
const MAX_CREATE_ATTEMPTS = 3;

/** 部屋を作る入力。値の検証は domain が行う。 */
export interface CreateRoomInput {
  readonly nickname: string;
  readonly roundCount: number;
}

/** 部屋を作った結果。トークンはこの応答でだけ返す。 */
export interface CreateRoomOutput {
  readonly room: RoomSnapshotDto;
  /** 作った人（ホスト）のプレイヤー識別子。 */
  readonly playerId: string;
  /** 作った人のプレイヤートークン。 */
  readonly playerToken: string;
}

/** 部屋を作る use case（UC-01 要件 1 / UC-01 要件 4 / UC-01 要件 5）。 */
export class CreateRoom {
  readonly #repository: RoomRepository;
  readonly #random: RandomSource;
  readonly #clock: Clock;

  constructor(repository: RoomRepository, random: RandomSource, clock: Clock) {
    this.#repository = repository;
    this.#random = random;
    this.#clock = clock;
  }

  /** ニックネームと周回数から部屋を作って保存する。入力の誤りは RoomError の Result で返す。 */
  async execute(input: CreateRoomInput): Promise<Result<CreateRoomOutput, RoomError>> {
    // ニックネームを周回数より先に検査する。画面の入力欄の並び順に合わせ、先に直すべき欄の誤りを返す
    const nickname = Nickname.create(input.nickname);
    if (isFailure(nickname)) {
      return failure(nickname.error);
    }
    const roundCount = RoundCount.create(input.roundCount);
    if (isFailure(roundCount)) {
      return failure(roundCount.error);
    }

    // 新しい部屋の保存の衝突は部屋コードの重なりなので、部屋ごと作り直して再試行する。
    // コードだけを差し替える口は集約に無く、まだ誰にも返していない部屋なので、作り直しで困らない
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
      const room = Room.create(nickname.value, roundCount.value, this.#clock.now(), this.#random);
      const saved = await this.#repository.save(room);
      if (isSuccess(saved)) {
        return success({
          room: toRoomSnapshotDto(room),
          playerId: room.host.playerId.value,
          playerToken: room.host.token.value,
        });
      }
      getLogger().warn("部屋コードが既にある部屋と重なったため作り直します", {
        roomCode: room.code.value,
        attempt,
      });
    }
    getLogger().error("部屋コードが重なり続けたため部屋を作れませんでした", {
      attempts: MAX_CREATE_ATTEMPTS,
    });
    // RoomError の Result にせず throw する。入力を直しても解消せず、利用者向けの文言の対応表に残したくない
    throw new Error("Could not allocate a unique room code.");
  }
}
