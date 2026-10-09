/** 進行状態がとりうる値（内部表現）。 */
type RoomStatusValue = "waiting" | "started";

/** 部屋の進行状態。ゲームが始まる前（待機中）か、始まった後か。 */
export class RoomStatus {
  readonly #value: RoomStatusValue;

  private constructor(value: RoomStatusValue) {
    this.#value = value;
  }

  /** 待機中の状態を作る。 */
  static waiting(): RoomStatus {
    return new RoomStatus("waiting");
  }

  /** ゲームが始まった状態を作る。 */
  static started(): RoomStatus {
    return new RoomStatus("started");
  }

  /** ゲームが始まっているか。 */
  hasStarted(): boolean {
    return this.#value === "started";
  }

  /** 同じ状態か。 */
  equals(other: RoomStatus): boolean {
    return this.#value === other.#value;
  }
}
