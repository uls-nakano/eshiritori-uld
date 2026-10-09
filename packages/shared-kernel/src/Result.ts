import type { DomainError } from "./DomainError";

/** 成功を表す。値の取り出しは `isSuccess` で絞り込んでから行う。 */
export interface Success<T> {
  /** 成功と失敗を見分ける内部の印。分岐には `isSuccess` / `isFailure` を使い、直接は読まない。 */
  readonly kind: "success";
  /** 成功時の値。値を持たない成功では `undefined`。 */
  readonly value: T;
}

/** 失敗を表す。エラーの取り出しは `isFailure` で絞り込んでから行う。 */
export interface Failure<E> {
  /** 成功と失敗を見分ける内部の印。分岐には `isSuccess` / `isFailure` を使い、直接は読まない。 */
  readonly kind: "failure";
  /** 失敗の内容。 */
  readonly error: E;
}

/**
 * 成功か失敗のどちらかを表す結果。
 * `E` の既定値は `DomainError`。`extends DomainError` の制約は付けない（Why not: リポジトリの保存の衝突のように、
 * DomainError ではない失敗の印を返す場面がありうるため）。
 */
export type Result<T, E = DomainError> = Success<T> | Failure<E>;

/** 値の無い成功（`Success<void>`）を作る。 */
export function success(): Success<void>;
/** 渡した値を持つ成功を作る。 */
export function success<T>(value: T): Success<T>;
export function success<T>(value?: T): Success<T | undefined> {
  return { kind: "success", value };
}

/** 渡したエラーを持つ失敗を作る。 */
export function failure<E>(error: E): Failure<E> {
  return { kind: "failure", error };
}

/** 結果が成功かを判定し、true の分岐で `value` を読めるよう型を絞り込む。 */
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.kind === "success";
}

/** 結果が失敗かを判定し、true の分岐で `error` を読めるよう型を絞り込む。 */
export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.kind === "failure";
}
