import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { fbDb } from "../../../lib/firebase";

function makeJoinCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function getUserHomeId(uid: string): Promise<string | null> {
  const uref = doc(fbDb, "users", uid);
  const usnap = await getDoc(uref);
  if (!usnap.exists()) return null;
  return (usnap.data().homeId as string | null) ?? null;
}

export async function createHome(params: { uid: string; name: string; type: "personal" | "shared" }) {
  const { uid, name, type } = params;
  const homesRef = collection(fbDb, "homes");

  const homeDoc = await addDoc(homesRef, {
    name,
    type,
    ownerUid: uid,
    joinCode: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const homeId = homeDoc.id;

  let joinCode: string | null = null;
  if (type === "shared") {
    joinCode = await reserveJoinCode({ uid, homeId });
    await updateDoc(doc(fbDb, "homes", homeId), {
      joinCode,
      updatedAt: serverTimestamp(),
    });
  }

  const memberRef = doc(fbDb, "homes", homeId, "members", uid);
  await setDoc(memberRef, {
    uid,
    role: "owner",
    joinedAt: serverTimestamp(),
  });

  const userRef = doc(fbDb, "users", uid);
  await updateDoc(userRef, { homeId, updatedAt: serverTimestamp() });

  return { homeId, joinCode };
}

export async function joinHomeByCode(params: { uid: string; code: string }) {
  const { uid } = params;
  const code = params.code.trim().toUpperCase();

    const codeSnap = await getDoc(doc(fbDb, "homeJoinCodes", code));
    if (!codeSnap.exists()) throw new Error("CODE_NOT_FOUND");

const data = codeSnap.data() as { homeId?: string; active?: boolean };

if (!data.homeId) throw new Error("CODE_INVALID");
if (data.active !== true) throw new Error("CODE_INACTIVE");

const homeId = data.homeId;

  const memberRef = doc(fbDb, "homes", homeId, "members", uid);
  await setDoc(
    memberRef,
    { uid, role: "member", joinedAt: serverTimestamp() },
    { merge: true }
  );

  const userRef = doc(fbDb, "users", uid);
  await updateDoc(userRef, { homeId, updatedAt: serverTimestamp() });

  return { homeId };
}

async function reserveJoinCode(params: { uid: string; homeId: string; tries?: number }) {
  const { uid, homeId, tries = 8 } = params;

  for (let i = 0; i < tries; i++) {
    const code = makeJoinCode(6);
    const codeRef = doc(fbDb, "homeJoinCodes", code);
    const snap = await getDoc(codeRef);

    if (snap.exists()) continue;

    await setDoc(codeRef, {
      homeId,
      createdAt: serverTimestamp(),
      createdByUid: uid,
      active: true,
    });

    return code;
  }

  throw new Error("CODE_GENERATION_FAILED");
}

export async function convertHomeToShared(params: { uid: string; homeId: string }) {
  const { uid, homeId } = params;

  const homeRef = doc(fbDb, "homes", homeId);
  const homeSnap = await getDoc(homeRef);
  if (!homeSnap.exists()) throw new Error("HOME_NOT_FOUND");

  const data = homeSnap.data() as { ownerUid?: string; type?: string; joinCode?: string | null };

  if (data.ownerUid !== uid) throw new Error("NOT_OWNER");
  if (data.type === "shared") return { joinCode: data.joinCode ?? null };

  const joinCode = await reserveJoinCode({ uid, homeId });

  await updateDoc(homeRef, {
    type: "shared",
    joinCode,
    updatedAt: serverTimestamp(),
  });

  return { joinCode };
}

export async function rotateHomeJoinCode(params: { uid: string; homeId: string }) {
  const { uid, homeId } = params;

  const homeRef = doc(fbDb, "homes", homeId);
  const homeSnap = await getDoc(homeRef);
  if (!homeSnap.exists()) throw new Error("HOME_NOT_FOUND");

  const data = homeSnap.data() as { ownerUid?: string; type?: string; joinCode?: string | null };

  if (data.ownerUid !== uid) throw new Error("NOT_OWNER");
  if (data.type !== "shared") throw new Error("HOME_NOT_SHARED");

  const prevCode = (data.joinCode ?? null)?.trim().toUpperCase() || null;
  const nextCode = await reserveJoinCode({ uid, homeId });
  const batch = writeBatch(fbDb);

  batch.update(homeRef, {
    joinCode: nextCode,
    updatedAt: serverTimestamp(),
  });

  if (prevCode) {
    const prevRef = doc(fbDb, "homeJoinCodes", prevCode);
    batch.update(prevRef, {
      active: false,
      deactivatedAt: serverTimestamp(),
      deactivatedByUid: uid,
    });
  }

  await batch.commit();

  return { joinCode: nextCode };
}