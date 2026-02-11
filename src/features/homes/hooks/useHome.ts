import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { fbDb } from "../../../lib/firebase";

export type HomeDoc = {
  name: string;
  type: "personal" | "shared";
  ownerUid: string;
  joinCode?: string | null;
};

export type MemberDoc = {
  uid: string;
  role: "owner" | "member";
};

export type UserMini = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};

type UserDoc = {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
};

export function useHome(homeId: string | null) {
  const [home, setHome] = useState<HomeDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [memberUsers, setMemberUsers] = useState<Record<string, UserMini>>({});
  const [loadingHome, setLoadingHome] = useState(false);

  useEffect(() => {
    if (!homeId) {
      setHome(null);
      setMembers([]);
      setMemberUsers({});
      setLoadingHome(false);
      return;
    }

    setLoadingHome(true);
    const unsub = onSnapshot(
      doc(fbDb, "homes", homeId),
      (snap) => {
        setHome(snap.exists() ? (snap.data() as HomeDoc) : null);
        setLoadingHome(false);
      },
      (err) => {
        console.error("[Firestore] homes/{homeId} snapshot failed", err);
        setHome(null);
        setLoadingHome(false);
      }
    );

    return () => unsub();
  }, [homeId]);

  useEffect(() => {
    if (!homeId) return;

    const unsub = onSnapshot(
      collection(fbDb, "homes", homeId, "members"),
      (qs) => {
        const list = qs.docs.map((d) => d.data() as MemberDoc);
        setMembers(list);
      },
      (err) => {
        console.error("[Firestore] homes/{homeId}/members snapshot failed", err);
        setMembers([]);
      }
    );

    return () => unsub();
  }, [homeId]);

  useEffect(() => {
    if (!homeId) return;

    let cancelled = false;

    async function loadUsers() {
      const uids = members.map((m) => m.uid);
      if (uids.length === 0) {
        setMemberUsers({});
        return;
      }

      const missing = uids.filter((uid) => !memberUsers[uid]);
      if (missing.length === 0) return;

      const entries = await Promise.all(
        missing.map(async (uid) => {
          const snap = await getDoc(doc(fbDb, "users", uid));
          const data = snap.exists() ? (snap.data() as UserDoc) : null;

          const mini: UserMini = {
            uid,
            displayName: data?.displayName ?? null,
            email: data?.email ?? null,
            photoURL: data?.photoURL ?? null,
          };

          return [uid, mini] as const;
        })
      );

      if (cancelled) return;
      setMemberUsers((prev) => {
        const next = { ...prev };
        for (const [uid, mini] of entries) next[uid] = mini;
        return next;
      });
    }

    loadUsers();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, homeId]);

  const membersCount = members.length;

  const membersPreview = useMemo(() => {
    const sorted = [...members].sort((a, b) => (a.role === "owner" ? -1 : 1) - (b.role === "owner" ? -1 : 1));
    return sorted.slice(0, 5);
  }, [members]);

  return { homeId, home, members, memberUsers, loadingHome, membersCount, membersPreview };
}
