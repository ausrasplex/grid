"use client";

import { useEffect, useState } from "react";
import { OUTBOX_EVENT, listOutbox, processOutbox, type OutboxItem } from "./outbox";

/** Photos still on this phone (optionally for one job), kept up to date. Also keeps the upload going. */
export function useOutbox(projectId?: string) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const all = await listOutbox();
      if (alive) setItems(projectId ? all.filter((item) => item.projectId === projectId) : all);
    };
    const startSending = () => {
      setOnline(navigator.onLine);
      void processOutbox();
    };
    void refresh();
    startSending();
    window.addEventListener(OUTBOX_EVENT, refresh);
    window.addEventListener("online", startSending);
    window.addEventListener("offline", startSending);
    const timer = setInterval(startSending, 30_000);
    return () => {
      alive = false;
      window.removeEventListener(OUTBOX_EVENT, refresh);
      window.removeEventListener("online", startSending);
      window.removeEventListener("offline", startSending);
      clearInterval(timer);
    };
  }, [projectId]);

  return {
    items,
    online,
    waiting: items.filter((item) => item.state !== "failed").length,
    failed: items.filter((item) => item.state === "failed"),
    uploading: items.some((item) => item.state === "uploading"),
  };
}
