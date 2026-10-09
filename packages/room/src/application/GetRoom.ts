import { getLogger } from "@eshiritori/shared-kernel";

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

  /** トークンの持ち主がメンバーの部屋の状態を返す。取れなければ RoomError を throw する。 */
  async execute(input: GetRoomInput): Promise<GetRoomOutput> {
    const code = RoomCode.create(input.roomCode);
    const room = await this.#repository.findByCode(code);
    if (room === undefined || room.isExpiredAt(this.#clock.now())) {
      getLogger().error("状態を取ろうとした部屋が無いか期限切れです", {
        roomCode: code.value,
        found: room !== undefined,
      });
      throw new RoomError("room_not_found", "Room was not found.");
    }
    // 無い・期限切れの部屋には、トークンの有無にかかわらず room_not_found を返すため、メンバーの確認は後に置く
    const member = room.findMember(PlayerToken.create(input.playerToken));
    if (member === undefined) {
      // トークンは秘密の値なのでログに出さない
      getLogger().error("部屋のメンバーでない人が部屋の状態を取ろうとしました", {
        roomCode: code.value,
      });
      throw new RoomError("not_member", "The player is not a member of the room.");
    }
    return { room: toRoomSnapshotDto(room), playerId: member.playerId.value };
  }
}
