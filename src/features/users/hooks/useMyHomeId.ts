import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { fbDb } from "../../../lib/firebase";

type UserDoc = {
  homeId?: string | null;
};

export function useMyHomeId(uid: string | null) {
  const [homeId, setHomeId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(
      doc(fbDb, "users", uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as UserDoc) : null;
        setHomeId(data?.homeId ?? null);
        setLoaded(true);
      },
      (err) => {
        console.error("[Firestore] users/{uid} snapshot failed", err);
        setHomeId(null);
        setLoaded(true);
      }
    );

    return unsub;
  }, [uid]);

  const effectiveHomeId = uid ? homeId : null;
  const loadingUserDoc = uid ? !loaded : false;

  return { homeId: effectiveHomeId, loadingUserDoc };
}
