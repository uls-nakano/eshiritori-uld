import { describe, expect, expectTypeOf, it } from "vitest";

import { DomainError } from "./DomainError";
import type { Result, Success } from "./Result";
import { failure, isFailure, isSuccess, success } from "./Result";

class SampleError extends DomainError<"broken"> {
  constructor() {
    super("sample", "broken", "Broken.");
  }
}

function parse(value: number): Result<number, SampleError> {
  return value > 0 ? success(value) : failure(new SampleError());
}

describe("success", () => {
  it("渡した値を持つ成功になる", () => {
    const result = success(42);

    expect(isSuccess(result) && result.value).toBe(42);
  });

  it("引数なしで値の無い成功を作れる", () => {
    const result = success();

    expectTypeOf(result).toEqualTypeOf<Success<void>>();
    expect(isSuccess(result)).toBe(true);
  });
});

describe("failure", () => {
  it("渡したエラーを持つ失敗になる", () => {
    const error = new SampleError();
    const result = failure(error);

    expect(isFailure(result) && result.error).toBe(error);
  });
});

describe("isSuccess", () => {
  it("成功なら true・失敗なら false になる", () => {
    expect(isSuccess(success(1))).toBe(true);
    expect(isSuccess(failure(new SampleError()))).toBe(false);
  });

  it("true の分岐で value を読める", () => {
    const result = parse(1);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
    }
  });
});

describe("isFailure", () => {
  it("失敗なら true・成功なら false になる", () => {
    expect(isFailure(failure(new SampleError()))).toBe(true);
    expect(isFailure(success(1))).toBe(false);
  });

  it("true の分岐で error を読める", () => {
    const result = parse(0);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expectTypeOf(result.error).toEqualTypeOf<SampleError>();
    }
  });
});
