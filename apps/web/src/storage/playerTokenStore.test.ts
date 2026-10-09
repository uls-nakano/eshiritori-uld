import { describe, expect, it } from "vitest";

import { createPlayerTokenStore } from "./playerTokenStore";

const memoryStorage = (): Pick<Storage, "getItem" | "setItem" | "removeItem"> => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

const brokenStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem: () => {
    throw new Error("使えない");
  },
  setItem: () => {
    throw new Error("使えない");
  },
  removeItem: () => {
    throw new Error("使えない");
  },
};

describe("save", () => {
  it("保存した部屋コードで load すると同じトークンが返り、別の部屋コードでは undefined", () => {
    const store = createPlayerTokenStore(memoryStorage());
    store.save("K7Q2XM", "token-hanako");
    expect(store.load("K7Q2XM")).toBe("token-hanako");
    expect(store.load("ABCDEF")).toBeUndefined();
  });

  it("記憶域が例外を投げても例外にならない", () => {
    const store = createPlayerTokenStore(brokenStorage);
    expect(() => {
      store.save("K7Q2XM", "token-hanako");
    }).not.toThrow();
  });
});

describe("load", () => {
  it("保存していない部屋は undefined", () => {
    expect(createPlayerTokenStore(memoryStorage()).load("K7Q2XM")).toBeUndefined();
  });

  it("記憶域が例外を投げたら undefined", () => {
    expect(createPlayerTokenStore(brokenStorage).load("K7Q2XM")).toBeUndefined();
  });
});

describe("remove", () => {
  it("消した後の load は undefined で、ほかの部屋のトークンは残る", () => {
    const store = createPlayerTokenStore(memoryStorage());
    store.save("K7Q2XM", "token-hanako");
    store.save("ABCDEF", "token-jiro");
    store.remove("K7Q2XM");
    expect(store.load("K7Q2XM")).toBeUndefined();
    expect(store.load("ABCDEF")).toBe("token-jiro");
  });

  it("記憶域が例外を投げても例外にならない", () => {
    const store = createPlayerTokenStore(brokenStorage);
    expect(() => {
      store.remove("K7Q2XM");
    }).not.toThrow();
  });
});
