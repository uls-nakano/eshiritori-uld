import { describe, expect, it } from "vitest";

import { RoomStatus } from "./RoomStatus";

describe("waiting", () => {
  it("待機中の状態はゲームが始まっていない", () => {
    expect(RoomStatus.waiting().hasStarted()).toBe(false);
  });
});

describe("started", () => {
  it("始まった状態はゲームが始まっている", () => {
    expect(RoomStatus.started().hasStarted()).toBe(true);
  });
});

describe("hasStarted", () => {
  it("待機中なら false、始まった状態なら true", () => {
    expect(RoomStatus.waiting().hasStarted()).toBe(false);
    expect(RoomStatus.started().hasStarted()).toBe(true);
  });
});

describe("equals", () => {
  it("待機中同士・始まった状態同士は等しい", () => {
    expect(RoomStatus.waiting().equals(RoomStatus.waiting())).toBe(true);
    expect(RoomStatus.started().equals(RoomStatus.started())).toBe(true);
  });

  it("待機中と始まった状態は等しくない", () => {
    expect(RoomStatus.waiting().equals(RoomStatus.started())).toBe(false);
  });
});
