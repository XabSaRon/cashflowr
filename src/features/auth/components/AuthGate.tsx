import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { doc, onSnapshot, deleteDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { fbDb } from "../../../lib/firebase";
import { useHome } from "../../homes/hooks/useHome";
import { HomeDetailsModal } from "../../homes/components/HomeDetailsModal";

import type { User } from "firebase/auth";
import { fbAuth } from "../../../lib/firebase";
import { ensureUserDoc } from "../../users/api/user.service";

import { useTranslation } from "react-i18next";
import "./AuthGate.css";

export function AuthGate(props: { children: (user: User) => React.ReactNode }) {
  const { t, i18n } = useTranslation();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const ensuredForUidRef = useRef<string | null>(null);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [homeOpen, setHomeOpen] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(fbAuth, async (u) => {
      setUser(u);
      setLoading(false);

      if (!u) {
        ensuredForUidRef.current = null;
          setHomeId(null);
          setHomeOpen(false);
        return;
      }

      if (ensuredForUidRef.current === u.uid) return;
      ensuredForUidRef.current = u.uid;

      try {
        await ensureUserDoc(u);
      } catch (e) {
        console.error("[Firestore] ensureUserDoc failed", e);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(doc(fbDb, "users", user.uid), (snap) => {
      const hid = (snap.data()?.homeId as string | null) ?? null;
      setHomeId(hid);

      if (!hid) setHomeOpen(false);
    });

    return () => unsub();
  }, [user]);

  const { home, loadingHome, membersCount, membersPreview, memberUsers } = useHome(homeId);
  const [lang, setLangState] = useState<"es" | "en">(
    i18n.language?.toLowerCase().startsWith("es") ? "es" : "en"
  );

  const setLang = (next: "es" | "en") => {
    setLangState(next);
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
  };

  async function removeMember(uidToRemove: string) {
    if (!homeId) return;
    await deleteDoc(doc(fbDb, "homes", homeId, "members", uidToRemove));
    await updateDoc(doc(fbDb, "users", uidToRemove), {
      homeId: null,
      updatedAt: serverTimestamp(),
    });
  }

  async function leaveHome() {
    if (!homeId || !user) return;

    const batch = writeBatch(fbDb);

    batch.delete(doc(fbDb, "homes", homeId, "members", user.uid));

    batch.update(doc(fbDb, "users", user.uid), {
      homeId: null,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  }

  if (loading) {
    return <div className="authgate authgate--loading">{t("loading")}</div>;
  }

  if (!user) {
    return (
      <div className="authgate">
        <div className="authgate__card">
          <div className="authgate__top">
            <h2 className="authgate__title">{t("loginTitle")}</h2>

            <div className="authgate__langSwitch" role="group" aria-label="Idioma">
              <button
                type="button"
                className={`authgate__langBtn ${lang === "es" ? "is-active" : ""}`}
                onClick={() => setLang("es")}
              >
                ES
              </button>
              <button
                type="button"
                className={`authgate__langBtn ${lang === "en" ? "is-active" : ""}`}
                onClick={() => setLang("en")}
              >
                EN
              </button>
            </div>
          </div>

          <p className="authgate__subtitle">{t("loginSubtitle")}</p>

          <button
            className="authgate__btn authgate__btn--google"
            onClick={async () => {
              try {
                const provider = new GoogleAuthProvider();
                await signInWithPopup(fbAuth, provider);
              } catch (e) {
                console.error("[Auth] signIn failed", e);
                alert(t("errors.signInFailed"));
              }
            }}
          >
            <span className="authgate__btnIcon" aria-hidden="true">
              <svg viewBox="0 0 48 48" width="18" height="18">
                <path
                  fill="#FFC107"
                  d="M43.611 20.083H42V20H24v8h11.303C33.653 32.658 29.196 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4c-7.682 0-14.344 4.337-17.694 10.691z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.096 0 9.791-1.957 13.314-5.143l-6.149-5.207C29.113 35.771 26.687 36 24 36c-5.175 0-9.62-3.318-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.611 20.083H42V20H24v8h11.303a12.05 12.05 0 0 1-4.138 5.65l.003-.002 6.149 5.207C36.88 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                />
              </svg>
            </span>

            <span>{t("loginWithGoogle")}</span>
          </button>
        </div>
      </div>
    );
  }

  const name = user.displayName ?? user.email ?? "";

  return (
    <div className="authgate authgate--signedin">
      <header className={`authgate__bar ${!homeId ? "authgate__bar--nohome" : ""}`}>
        <div className="authgate__profile">
          {user.photoURL ? (
            <img className="authgate__avatar" src={user.photoURL} alt={name} referrerPolicy="no-referrer" />
          ) : (
            <div className="authgate__avatar authgate__avatar--fallback" aria-hidden="true">
              {(name?.trim()?.[0] ?? "?").toUpperCase()}
            </div>
          )}

          <div className="authgate__hello">{t("hello", { name })}</div>
        </div>

        {homeId ? (
          <button
            type="button"
            className={`authgate__homeBtn ${homeOpen ? "is-open" : ""}`}
            onClick={() => setHomeOpen(true)}
            title={home?.name ?? ""}
          >
            <span className="authgate__homeIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path
                  fill="currentColor"
                  d="M12 3.1 3 10v10a1 1 0 0 0 1 1h5v-7h6v7h5a1 1 0 0 0 1-1V10l-9-6.9Z"
                  opacity=".9"
                />
              </svg>
            </span>

            <span className="authgate__homeText">
              {loadingHome ? "…" : (home?.name ?? "")}
            </span>

            <span className="authgate__homeCaret" aria-hidden="true">›</span>
          </button>
        ) : null}

        <div className="authgate__actions">
          <div className="authgate__langSwitch" role="group" aria-label="Idioma">
            <button
              type="button"
              className={`authgate__langBtn ${lang === "es" ? "is-active" : ""}`}
              onClick={() => setLang("es")}
            >
              ES
            </button>
            <button
              type="button"
              className={`authgate__langBtn ${lang === "en" ? "is-active" : ""}`}
              onClick={() => setLang("en")}
            >
              EN
            </button>
          </div>

          <button
            className="authgate__btn authgate__btn--ghost"
            onClick={async () => {
              try {
                await signOut(fbAuth);
              } catch (e) {
                console.error("[Auth] signOut failed", e);
              }
            }}
          >
            {t("signOut")}
          </button>
        </div>
      </header>

      <div className="authgate__content">{props.children(user)}</div>

      {homeId ? (
        <HomeDetailsModal
          open={homeOpen}
          onClose={() => setHomeOpen(false)}
          homeId={homeId}
          home={home}
          loadingHome={loadingHome}
          currentUid={user.uid}
          membersCount={membersCount}
          membersPreview={membersPreview}
          memberUsers={memberUsers}
          joinCode={home?.joinCode ?? null}
          onRemoveMember={removeMember}
          onLeaveHome={leaveHome}
        />
      ) : null}

    </div>
  );
  
}

