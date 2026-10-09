import type { Result } from "@eshiritori/shared-kernel";
import { failure, isFailure, success } from "@eshiritori/shared-kernel";

import { PlayerToken } from "../domain/room/PlayerToken";
import { RoomCode } from "../domain/room/RoomCode";
import type { RoomRepository } from "../domain/room/RoomRepository";
import { RoomError } from "../errors/RoomError";
import type { Clock } from "./Clock";
import type { RoomSnapshotDto } from "./RoomSnapshotDto";
import { toRoomSnapshotDto } from "./RoomSnapshotDto";

/** 部屋の状態を取る入力。 */
export interface GetRoomInput {
  readonly roomCode: string;
  readonly playerToken: string;
}

/** 部屋の状態を取った結果。 */
export interface GetRoomOutput {
  readonly room: RoomSnapshotDto;
  /** 要求した本人（トークンの持ち主）のプレイヤー識別子。 */
  readonly playerId: string;
}

/** 部屋の状態を取る use case。メンバーだけが取れる。読むだけで、保存しない（期限を延ばさない）。 */
export class GetRoom {
  readonly #repository: RoomRepository;
  readonly #clock: Clock;

  constructor(repository: RoomRepository, clock: Clock) {
    this.#repository = repository;
    this.#clock = clock;
  }

  /** トークンの持ち主がメンバーの部屋の状態を返す。取れなければ RoomError の Result で返す。 */
  async execute(input: GetRoomInput): Promise<Result<GetRoomOutput, RoomError>> {
    const code = RoomCode.create(input.roomCode);
    if (isFailure(code)) {
      return failure(code.error);
    }
    const room = await this.#repository.findByCode(code.value);
    if (room === undefined || room.isExpiredAt(this.#clock.now())) {
      return failure(new RoomError("room_not_found", "Room was not found."));
    }
    // 無い・期限切れの部屋には、トークンの有無にかかわらず room_not_found を返すため、メンバーの確認は後に置く
    const member = room.findMember(PlayerToken.create(input.playerToken));
    if (member === undefined) {
      return failure(new RoomError("not_member", "The player is not a member of the room."));
    }
    return success({ room: toRoomSnapshotDto(room), playerId: member.playerId.value });
  }
}
