import { doc, serverTimestamp, setDoc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { fbDb } from "../../../lib/firebase";

export async function ensureUserDoc(user: User) {
  const ref = doc(fbDb, "users", user.uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : null;

  await setDoc(
    ref,
    {
      uid: user.uid,
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      homeId: (existing?.homeId as string | null | undefined) ?? null,
      createdAt: snap.exists() ? snap.data().createdAt ?? null : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
