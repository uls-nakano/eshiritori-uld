/** 時計。use case が「いま」を受け取る port。 */
export interface Clock {
  /** 現在時刻。 */
  now(): Date;
}
