import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { fbDb } from "../../../lib/firebase";

export type IncomeFrequency = "once" | "monthly" | "quarterly" | "yearly";
export type IncomeScope = "shared" | "personal";

export type IncomeDoc = {
  amountCents: number;
  source: string;
  frequency: IncomeFrequency;
  scope: IncomeScope;
  date: Timestamp;
  endDate?: Timestamp | null;
  groupId?: string;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
};

export type IncomeRow = { id: string } & IncomeDoc;

export function incomesCol(homeId: string) {
  return collection(fbDb, "homes", homeId, "incomes");
}

export async function addIncome(params: {
  homeId: string;
  amountCents: number;
  source: string;
  frequency: IncomeFrequency;
  scope: IncomeScope;
  date: Date;
  createdByUid: string;
  groupId?: string;
}) {
  const payload: Record<string, unknown> = {
    amountCents: params.amountCents,
    source: params.source.trim(),
    frequency: params.frequency,
    scope: params.scope,
    date: Timestamp.fromDate(params.date),
    endDate: null,
    createdByUid: params.createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.groupId !== undefined) {
    payload.groupId = params.groupId;
  }

  return addDoc(incomesCol(params.homeId), payload);
}

export function listenIncomes(homeId: string, cb: (rows: IncomeRow[]) => void) {
  const q = query(incomesCol(homeId), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as IncomeDoc) })));
  });
}

export async function overwriteIncome(params: {
  homeId: string;
  incomeId: string;
  amountCents: number;
  source: string;
  frequency: IncomeFrequency;
  scope: IncomeScope;
  date: Date;
  endDate?: Date | null;
  groupId?: string | null;
}) {
  const ref = doc(fbDb, "homes", params.homeId, "incomes", params.incomeId);

  const payload: Record<string, unknown> = {
    amountCents: params.amountCents,
    source: params.source.trim(),
    frequency: params.frequency,
    scope: params.scope,
    date: Timestamp.fromDate(params.date),
    updatedAt: serverTimestamp(),
  };

  if (params.endDate !== undefined) {
    payload.endDate =
      params.endDate === null ? null : Timestamp.fromDate(params.endDate);
  }

  if (params.groupId !== undefined) {
    payload.groupId = params.groupId;
  }

  return updateDoc(ref, payload);
}

export async function deleteIncome(params: {
  homeId: string;
  incomeId: string;
}) {
  const ref = doc(fbDb, "homes", params.homeId, "incomes", params.incomeId);
  return deleteDoc(ref);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export async function splitIncomeChange(params: {
  homeId: string;
  oldIncomeId: string;
  oldGroupId?: string | null;
  newStartDate: Date;
  amountCents: number;
  source: string;
  frequency: IncomeFrequency;
  scope: IncomeScope;
  currentUid: string;
  endDate?: Date | null;
}) {
  const newStart = startOfDay(params.newStartDate);
  const oldEnd = addDays(newStart, -1);
  const groupId = params.oldGroupId ?? params.oldIncomeId;

  // 1) Cerrar el tramo anterior + asegurar groupId
  const oldRef = doc(
    fbDb,
    "homes",
    params.homeId,
    "incomes",
    params.oldIncomeId,
  );
  await updateDoc(oldRef, {
    endDate: Timestamp.fromDate(oldEnd),
    groupId,
    updatedAt: serverTimestamp(),
  });

  // 2) Crear el nuevo tramo con el mismo groupId
  return addDoc(incomesCol(params.homeId), {
    amountCents: params.amountCents,
    source: params.source.trim(),
    frequency: params.frequency,
    scope: params.scope,
    date: Timestamp.fromDate(newStart),
    endDate: params.endDate ? Timestamp.fromDate(params.endDate) : null,
    groupId,
    createdByUid: params.currentUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
