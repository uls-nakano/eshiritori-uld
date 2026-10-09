import type { RandomSource } from "../src/domain/random/RandomSource";
import { Nickname } from "../src/domain/room/Nickname";
import { Room } from "../src/domain/room/Room";
import { RoundCount } from "../src/domain/room/RoundCount";

/** テストの基準時刻。共有するので、テストは写して使うか、変更しない。 */
export const ROOM_CREATED_AT: Date = new Date("2026-10-09T09:00:00.000Z");

/** 呼ぶたびに 0, 1, 2, … を bound で割った余りを返す乱数の源。 */
export function sequenceRandom(): RandomSource {
  let count = 0;
  return {
    nextInt(bound: number): number {
      const value = count % bound;
      count += 1;
      return value;
    },
  };
}

/** 値を順に返し、渡された bound を記録する乱数の源。値が尽きたら throw する。 */
export function fixedRandom(
  values: readonly number[],
): RandomSource & { readonly bounds: number[] } {
  const bounds: number[] = [];
  let index = 0;
  return {
    bounds,
    nextInt(bound: number): number {
      bounds.push(bound);
      const value = values[index];
      if (value === undefined) {
        throw new Error("fixedRandom ran out of values.");
      }
      index += 1;
      return value;
    },
  };
}

/** 成功するはずのニックネームを作る。 */
export function nicknameOf(value: string): Nickname {
  return Nickname.create(value);
}

/** 成功するはずの周回数を作る。 */
export function roundCountOf(value: number): RoundCount {
  return RoundCount.create(value);
}

/** 先頭の名前で部屋を作り（周回数 1）、残りを順に参加させた部屋。 */
export function roomWith(nicknames: readonly string[], now: Date = ROOM_CREATED_AT): Room {
  const [first, ...rest] = nicknames;
  if (first === undefined) {
    throw new Error("roomWith needs at least one nickname.");
  }
  const random = sequenceRandom();
  const room = Room.create(nicknameOf(first), roundCountOf(1), now, random);
  for (const name of rest) {
    room.join(nicknameOf(name), now, random);
  }
  return room;
}
