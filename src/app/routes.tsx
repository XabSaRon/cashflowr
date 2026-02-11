import { Navigate, Route, Routes } from "react-router-dom";
import type { User } from "firebase/auth";
import { useEffect, useState } from "react";
import { doc, onSnapshot  } from "firebase/firestore";
import { fbDb } from "../lib/firebase";

import { HomeOnboardingPage } from "../features/homes/pages/HomeOnboardingPage";
import { DashboardPage } from "../features/dashboard/pages/DashboardPage";


export function AppRoutes({ user }: { user: User }) {
  const [homeId, setHomeId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(fbDb, "users", user.uid),
      (snap) => {
        const hid = snap.exists()
          ? ((snap.data().homeId as string | null) ?? null)
          : null;

        setHomeId(hid);
      },
      (err) => {
        console.error("[Firestore] user doc snapshot failed", err);
        setHomeId(null);
      }
    );

    return () => unsub();
  }, [user.uid]);

  if (homeId === undefined) {
    return <div style={{ padding: 24 }}>Cargando...</div>;
  }

  return (
    <Routes>
      <Route
        path="/onboarding"
        element={homeId ? <Navigate to="/" replace /> : <HomeOnboardingPage user={user} />}
      />
      <Route
        path="/"
        element={homeId ? <DashboardPage user={user} /> : <Navigate to="/onboarding" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}