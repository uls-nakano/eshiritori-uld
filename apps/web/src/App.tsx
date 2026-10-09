import { type ReactElement, useEffect, useState } from "react";

import type { ApiClient } from "./api/apiClient";
import type { ConnectRoomSocket } from "./api/roomSocket";
import { RoomPage } from "./pages/RoomPage";
import { TopPage } from "./pages/TopPage";
import type { PlayerTokenStore } from "./storage/playerTokenStore";

/** main.tsx が組み立てた、ブラウザの外とのやりとりの口。 */
export interface AppProps {
  api: ApiClient;
  tokenStore: PlayerTokenStore;
  connectSocket: ConnectRoomSocket;
  copyText: (text: string) => Promise<void>;
  /** 配信元のオリジン。招待 URL の組み立てに使う。 */
  appOrigin: string;
}

/** /r/{部屋コード}（末尾の / は許す）なら部屋コードを、それ以外は undefined を返す。WaitingRoom の招待 URL の形と揃える。 */
function roomCodeFromPath(pathname: string): string | undefined {
  const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (match?.[1] === undefined) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** 画面の入口。URL が /r/{部屋コード} なら部屋のページ、それ以外はトップ。 */
export function App({
  api,
  tokenStore,
  connectSocket,
  copyText,
  appOrigin,
}: AppProps): ReactElement {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = (): void => {
      setPathname(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const roomCode = roomCodeFromPath(pathname);

  return (
    <main>
      <h1>絵しりとり</h1>
      {roomCode === undefined ? (
        <TopPage
          api={api}
          tokenStore={tokenStore}
          onEnterRoom={(code) => {
            const path = `/r/${encodeURIComponent(code)}`;
            window.history.pushState(null, "", path);
            setPathname(path);
          }}
        />
      ) : (
        <RoomPage
          key={roomCode}
          roomCode={roomCode}
          api={api}
          tokenStore={tokenStore}
          connectSocket={connectSocket}
          appOrigin={appOrigin}
          copyText={copyText}
        />
      )}
    </main>
  );
}
