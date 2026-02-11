import type { User } from "firebase/auth";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createHome, joinHomeByCode } from "../api/home.service";
import "./HomeOnboardingPage.css";

export function HomeOnboardingPage({ user }: { user: User }) {
  const { t } = useTranslation();

  const [mode, setMode] = useState<"personal" | "shared">("personal");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLabel = busy ? t("onboarding.creating") : t("onboarding.createHome");

  return (
    <div className="onb" aria-busy={busy}>
      <div className="onb__card">
        <h1 className="onb__title">{t("onboarding.title")}</h1>
        <p className="onb__sub">{t("onboarding.subtitle")}</p>

        <div className="onb__seg">
          <button
            type="button"
            disabled={busy}
            className={mode === "personal" ? "is-active" : ""}
            onClick={() => setMode("personal")}
          >
            {t("onboarding.personal")}
          </button>

          <button
            type="button"
            disabled={busy}
            className={mode === "shared" ? "is-active" : ""}
            onClick={() => setMode("shared")}
          >
            {t("onboarding.shared")}
          </button>
        </div>

        <label className="onb__label">
          {t("onboarding.homeNameLabel")}
          <input
            disabled={busy}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("onboarding.homeNamePlaceholder")}
            autoComplete="off"
          />
        </label>

        {mode === "shared" && (
          <div className="onb__hint">
            {t("onboarding.sharedHintPrefix")} <strong>{t("onboarding.code")}</strong>{" "}
            {t("onboarding.sharedHintSuffix")}
          </div>
        )}

        {error && <div className="onb__error">{error}</div>}

        <button
          className="onb__primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);

            const finalName = name.trim();

            try {
              await createHome({
                uid: user.uid,
                name: finalName,
                type: mode,
              });
            } catch (e) {
              console.error(e);
              setError(t("onboarding.errors.createHomeFailed"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {createLabel}
        </button>

        <hr className="onb__hr" />

        <div className="onb__join">
          <h2 className="onb__joinTitle">{t("onboarding.haveCodeTitle")}</h2>

          <div className="onb__joinRow">
            <input
              disabled={busy}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("onboarding.codePlaceholder")}
              autoComplete="off"
              spellCheck={false}
            />

            <button
              type="button"
              disabled={busy || code.trim().length < 4}
              onClick={async () => {
                setBusy(true);
                setError(null);

                try {
                  await joinHomeByCode({ uid: user.uid, code });
                } catch (e: unknown) {
                  console.error(e);

                  const message =
                    e instanceof Error ? e.message : typeof e === "string" ? e : "";

                  setError(
                    message === "CODE_NOT_FOUND" || message === "CODE_INVALID"
                      ? t("onboarding.errors.codeInvalid")
                      : message === "CODE_INACTIVE"
                      ? t("onboarding.errors.codeInactive")
                      : t("onboarding.errors.joinHomeFailed")
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("onboarding.join")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
