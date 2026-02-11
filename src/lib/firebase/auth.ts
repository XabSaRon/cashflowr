import { getAuth } from "firebase/auth";
import { fbApp } from "./app";

export const fbAuth = getAuth(fbApp);
