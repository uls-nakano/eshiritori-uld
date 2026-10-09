import { describe, expect, it } from "vitest";

import { DomainError } from "./DomainError";

class SampleError extends DomainError<"not_found" | "conflict"> {
  constructor(errorCode: "not_found" | "conflict", detail: string) {
    super("sample", errorCode, detail);
  }
}

describe("constructor", () => {
  it("継承クラスが固定した packageCode と、渡した errorCode・detail を保持する", () => {
    const error = new SampleError("not_found", "Sample was not found.");

    expect(error.packageCode).toBe("sample");
    expect(error.errorCode).toBe("not_found");
    expect(error.detail).toBe("Sample was not found.");
  });

  it("code は packageCode と errorCode をドットでつないだ識別子になる", () => {
    const error = new SampleError("conflict", "Already exists.");

    expect(error.code).toBe("sample.conflict");
  });

  it("Error と DomainError の両方のインスタンスとして扱える", () => {
    const error = new SampleError("conflict", "Already exists.");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
  });

  it("name は継承クラスの名前になる", () => {
    const error = new SampleError("conflict", "Already exists.");

    expect(error.name).toBe("SampleError");
  });

  it("message に code と detail が含まれる", () => {
    const error = new SampleError("conflict", "Already exists.");

    expect(error.message).toBe("sample.conflict: Already exists.");
  });
});
