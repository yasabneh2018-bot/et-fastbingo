import { useEffect, useState } from "react";
import { getLivePlayers, type LivePlayer } from "@/lib/store";

/** Reactive list of live players. Polls every 2s and reacts to cross-tab storage events. */
export function useLivePlayers(): LivePlayer[] {
  const [list, setList] = useState<LivePlayer[]>(() =>
    typeof window === "undefined" ? [] : getLivePlayers(),
  );
  useEffect(() => {
    const tick = () => setList(getLivePlayers());
    tick();
    const id = window.setInterval(tick, 1000);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === "fk_live_players") tick();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return list;
}
