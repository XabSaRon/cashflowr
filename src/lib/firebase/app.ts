import { initializeApp, getApps } from "firebase/app";
import { firebaseConfig } from "./config";

export const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
