import { getFirestore } from "firebase/firestore";
import { fbApp } from "./app";

export const fbDb = getFirestore(fbApp, "default");