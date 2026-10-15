import { useEffect, useState } from "react";
import { getLivePlayers, onStoreChange, type LivePlayer } from "@/lib/store";

/** Reactive list of live players, shared through Lovable Cloud in real time. */
export function useLivePlayers(): LivePlayer[] {
  const [list, setList] = useState<LivePlayer[]>([]);
  useEffect(() => {
    const tick = () => setList(getLivePlayers());
    tick();
    const id = window.setInterval(tick, 1000); // drop stale players after TTL
    const off = onStoreChange(tick);
    return () => { window.clearInterval(id); off(); };
  }, []);
  return list;
}
