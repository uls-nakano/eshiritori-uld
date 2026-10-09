import { type ReactElement, useState } from "react";

import { type ApiClient, isApiFailure } from "../api/apiClient";
import { CreateRoomForm } from "../components/CreateRoomForm";
import { JoinRoomForm } from "../components/JoinRoomForm";
import type { PlayerTokenStore } from "../storage/playerTokenStore";

/** トップ画面に渡す口。 */
export interface TopPageProps {
  api: ApiClient;
  tokenStore: PlayerTokenStore;
  /** 部屋に入った（作った）後、その部屋の URL へ移る。 */
  onEnterRoom: (roomCode: string) => void;
}

/** トップ画面。部屋を作る欄と、部屋コードで入る欄を並べる。 */
export function TopPage({ api, tokenStore, onEnterRoom }: TopPageProps): ReactElement {
  const [createErrorCode, setCreateErrorCode] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [joinErrorCode, setJoinErrorCode] = useState<string | undefined>(undefined);
  const [joining, setJoining] = useState(false);

  return (
    <>
      <CreateRoomForm
        errorCode={createErrorCode}
        submitting={creating}
        onSubmit={(request) => {
          setCreateErrorCode(undefined);
          setCreating(true);
          void api.createRoom(request).then((result) => {
            if (isApiFailure(result)) {
              setCreating(false);
              setCreateErrorCode(result.code);
              return;
            }
            tokenStore.save(result.value.room.code, result.value.player.playerToken);
            onEnterRoom(result.value.room.code);
          });
        }}
      />
      <JoinRoomForm
        errorCode={joinErrorCode}
        submitting={joining}
        onSubmit={({ roomCode, nickname }) => {
          setJoinErrorCode(undefined);
          setJoining(true);
          void api.joinRoom(roomCode, { nickname }).then((result) => {
            if (isApiFailure(result)) {
              setJoining(false);
              setJoinErrorCode(result.code);
              return;
            }
            tokenStore.save(result.value.room.code, result.value.player.playerToken);
            onEnterRoom(result.value.room.code);
          });
        }}
      />
    </>
  );
}
