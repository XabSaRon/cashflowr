import { useMemo, useRef, useSyncExternalStore } from "react";
import type { IncomeRow } from "../api/incomes.service";
import { listenIncomes } from "../api/incomes.service";

type Snapshot = {
  rows: IncomeRow[];
  ready: boolean;
  version: number;
};

export function useIncomes(homeId: string | null) {
  const initialSnapshot: Snapshot = { rows: [], ready: false, version: 0 };

  const snapRef = useRef<Snapshot>(initialSnapshot);
  const lastSnapshotRef = useRef<Snapshot>(initialSnapshot);

  const subscribe = useMemo(() => {
    return (onStoreChange: () => void) => {
      if (!homeId) return () => {};

      snapRef.current = {
        rows: [],
        ready: false,
        version: snapRef.current.version + 1,
      };
      onStoreChange();

      const unsub = listenIncomes(homeId, (r) => {
        snapRef.current = {
          rows: r,
          ready: true,
          version: snapRef.current.version + 1,
        };
        onStoreChange();
      });

      return () => unsub();
    };
  }, [homeId]);

  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const next = snapRef.current;
      const prev = lastSnapshotRef.current;

      if (prev.version === next.version) return prev;

      lastSnapshotRef.current = next;
      return next;
    },
    () => ({ rows: [], ready: true, version: 0 })
  );

  const totalCents = useMemo(() => {
    if (!homeId) return 0;
    return snapshot.rows.reduce((acc, r) => acc + r.amountCents, 0);
  }, [homeId, snapshot.rows]);

  return {
    rows: homeId ? snapshot.rows : [],
    loading: !!homeId && !snapshot.ready,
    totalCents,
  };
}
