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
}) {
  return addDoc(incomesCol(params.homeId), {
    amountCents: params.amountCents,
    source: params.source.trim(),
    frequency: params.frequency,
    scope: params.scope,
    date: Timestamp.fromDate(params.date),
    createdByUid: params.createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function listenIncomes(homeId: string, cb: (rows: IncomeRow[]) => void) {
  const q = query(incomesCol(homeId), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as IncomeDoc) })));
  });
}

export async function updateIncome(params: {
  homeId: string;
  incomeId: string;
  amountCents: number;
  source: string;
  frequency: IncomeFrequency;
  scope: IncomeScope;
  date: Date;
}) {
  const ref = doc(fbDb, "homes", params.homeId, "incomes", params.incomeId);

  return updateDoc(ref, {
    amountCents: params.amountCents,
    source: params.source.trim(),
    frequency: params.frequency,
    scope: params.scope,
    date: Timestamp.fromDate(params.date),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteIncome(params: { homeId: string; incomeId: string }) {
  const ref = doc(fbDb, "homes", params.homeId, "incomes", params.incomeId);
  return deleteDoc(ref);
}
