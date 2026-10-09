import type { components } from "@eshiritori/api-contract";
import type { ReactElement } from "react";
import { useId } from "react";

type RoomSnapshot = components["schemas"]["RoomSnapshot"];

/** ゲーム画面のうち、この移行単位の範囲（描く順番）の表示。 */
export interface DrawingOrderViewProps {
  /** ゲームが始まった後の部屋の写し。members の並びが描く順番。 */
  room: RoomSnapshot;
  /** この画面を見ている本人のプレイヤー識別子。「あなた」の印に使う。 */
  viewerPlayerId: string;
}

/** ゲームが始まった後の画面。部屋のメンバーの並びのまま描く順番を出す（並べ替えない）。 */
export function DrawingOrderView({ room, viewerPlayerId }: DrawingOrderViewProps): ReactElement {
  const headingId = useId();
  return (
    <section>
      <h2>ゲームが始まりました</h2>
      <p>周回数: {room.roundCount} 周</p>
      <h3 id={headingId}>描く順番</h3>
      <ol aria-labelledby={headingId}>
        {room.members.map((member) => (
          <li key={member.playerId}>
            {member.nickname}
            {member.playerId === viewerPlayerId ? "（あなた）" : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
