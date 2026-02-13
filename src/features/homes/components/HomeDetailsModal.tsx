import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { convertHomeToShared, rotateHomeJoinCode } from "../api/home.service";
import { ConfirmModal } from "../../shared/components/ConfirmModal";
import "./HomeDetailsModal.css";

type HomeDoc = {
  name: string;
  type: "personal" | "shared";
  ownerUid: string;
};

type MemberDoc = {
  uid: string;
  role: "owner" | "member";
};

type UserMini = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};

const MEMBERS_PREVIEW_LIMIT = 2;

export function HomeDetailsModal(props: {
  open: boolean;
  onClose: () => void;
  homeId: string | null;
  home: HomeDoc | null;
  loadingHome: boolean;
  currentUid: string;
  membersCount: number;
  membersPreview: MemberDoc[];
  memberUsers: Record<string, UserMini>;
  joinCode?: string | null;

  onLeaveHome?: () => Promise<void> | void;
  onRemoveMember?: (uid: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const {
    open,
    onClose,
    homeId,
    home,
    loadingHome,
    currentUid,
    membersCount,
    membersPreview,
    memberUsers,
    joinCode,
    onLeaveHome,
    onRemoveMember,
  } = props;

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [kickTarget, setKickTarget] = useState<{
    uid: string;
    label: string;
  } | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);

  const isOwner = !!home?.ownerUid && home.ownerUid === currentUid;
  const isConfirmOpen = !!kickTarget || leaveConfirmOpen || rotateConfirmOpen;
  const isBusyConfirm =
    busy === "kick-confirm" || busy === "leave" || busy === "rotate";

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (isBusyConfirm) return;
      if (isConfirmOpen) return;
      onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, isBusyConfirm, isConfirmOpen]);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setBusy(null);
    setShowAllMembers(false);
    setKickTarget(null);
    setLeaveConfirmOpen(false);
    setRotateConfirmOpen(false);
  }, [open]);

  const title = loadingHome ? "…" : (home?.name ?? t("dashboard.notFound"));

  const members = useMemo(() => {
    const sorted = [...membersPreview].sort((a, b) =>
      a.role === b.role ? 0 : a.role === "owner" ? -1 : 1,
    );
    return sorted;
  }, [membersPreview]);

  const hasMoreMembers = members.length > MEMBERS_PREVIEW_LIMIT;
  const visibleMembers = showAllMembers
    ? members
    : members.slice(0, MEMBERS_PREVIEW_LIMIT);

  async function copyJoinCode() {
    if (!joinCode) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinCode);
      } else {
        const ta = document.createElement("textarea");
        ta.value = joinCode;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function handleConvertToShared() {
    if (!homeId) return;
    try {
      setBusy("convert");
      await convertHomeToShared({ uid: currentUid, homeId });
    } finally {
      setBusy(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="hmodal__backdrop hmodal__backdrop--homeDetails"
      onClick={() => {
        if (isBusyConfirm) return;
        if (isConfirmOpen) return;
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Home details"
    >
      <div className="hmodal__panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="hmodal__top">
          <div className="hmodal__titleWrap">
            <div className="hmodal__title">{title}</div>

            <div className="hmodal__metaRow">
              {home?.type ? (
                <span
                  className={`hmodal__pill ${home.type === "shared" ? "is-shared" : "is-personal"}`}
                >
                  <span className="hmodal__pillIcon" aria-hidden="true">
                    {home.type === "shared" ? <IconUsers /> : <IconHome />}
                  </span>
                  <span>
                    {home.type === "shared"
                      ? t("onboarding.shared")
                      : t("onboarding.personal")}
                  </span>
                </span>
              ) : null}

              <span className="hmodal__dot" aria-hidden="true" />

              <span className="hmodal__pill">
                <span className="hmodal__pillIcon" aria-hidden="true">
                  <IconUser />
                </span>
                <span>
                  {t("dashboard.membersCount", { count: membersCount })}
                </span>
              </span>
            </div>
          </div>

          <button
            className="hmodal__close"
            onClick={() => {
              if (isBusyConfirm) return;
              if (isConfirmOpen) return;
              onClose();
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="hmodal__divider" />

        {/* Section: Members */}
        <div className="hmodal__section hmodal__section--first">
          <div className="hmodal__sectionHead">
            <div className="hmodal__sectionTitle">
              {t("dashboard.members") ?? "Miembros"}
            </div>

            {hasMoreMembers ? (
              <button
                type="button"
                className="hmodal__btn hmodal__btn--ghost hmodal__btn--compact"
                onClick={() => setShowAllMembers((v) => !v)}
                disabled={isConfirmOpen || isBusyConfirm}
              >
                {showAllMembers
                  ? (t("common.showLess") ?? "Ver menos")
                  : (t("common.showMoreCount", {
                      count: members.length - MEMBERS_PREVIEW_LIMIT,
                    }) ?? `Ver ${members.length - MEMBERS_PREVIEW_LIMIT} más`)}
              </button>
            ) : null}
          </div>

          <div className="hmodal__members">
            {visibleMembers.map((m) => {
              const u = memberUsers[m.uid];
              const label =
                u?.displayName ?? u?.email ?? `${m.uid.slice(0, 6)}…`;
              const secondary =
                u?.email ?? (u?.displayName ? `${m.uid.slice(0, 6)}…` : "");
              const initial = (u?.displayName ?? u?.email ?? "?")
                .trim()
                .charAt(0)
                .toUpperCase();

              const canKick =
                isOwner &&
                m.uid !== currentUid &&
                m.role !== "owner" &&
                !!onRemoveMember;

              return (
                <div key={m.uid} className="hmodal__member">
                  <div className="hmodal__avatar" title={label}>
                    {u?.photoURL ? (
                      <img
                        className="hmodal__avatarImg"
                        src={u.photoURL}
                        alt={label}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="hmodal__avatarInitial">{initial}</span>
                    )}
                  </div>

                  <div className="hmodal__memberText">
                    <div className="hmodal__memberName">
                      <span className="hmodal__nameEllip">{label}</span>
                      {m.role === "owner" ? (
                        <span className="hmodal__roleTag">
                          {t("dashboard.ownerTag") ?? "Propietario"}
                        </span>
                      ) : null}
                    </div>

                    {secondary ? (
                      <div className="hmodal__memberSub">{secondary}</div>
                    ) : null}
                  </div>

                  {canKick ? (
                    <button
                      className="hmodal__iconBtn danger"
                      onClick={() => {
                        setLeaveConfirmOpen(false);
                        setKickTarget({ uid: m.uid, label });
                      }}
                      disabled={isConfirmOpen || isBusyConfirm}
                      title={t("dashboard.kick") ?? "Expulsar"}
                      aria-label="Remove member"
                    >
                      {busy === "kick-confirm" && kickTarget?.uid === m.uid
                        ? "…"
                        : "⨯"}
                    </button>
                  ) : (
                    <span className="hmodal__spacer" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section: Convert personal -> shared */}
        {home?.type === "personal" && isOwner ? (
          <div className="hmodal__section">
            <div className="hmodal__sectionTitle">
              {t("dashboard.shareHome") ?? "Compartir hogar"}
            </div>

            <div className="hmodal__ctaBox">
              <div className="hmodal__hint">
                {t("dashboard.personalHomeHint") ??
                  "Este hogar es personal. Si lo conviertes a compartido podrás invitar a otras personas con un código."}
              </div>

              <button
                className="hmodal__btn hmodal__btn--primary"
                onClick={handleConvertToShared}
                disabled={
                  !homeId ||
                  busy === "convert" ||
                  isConfirmOpen ||
                  isBusyConfirm
                }
              >
                {busy === "convert"
                  ? "…"
                  : (t("dashboard.convertToShared") ??
                    "Convertir a compartido")}
              </button>
            </div>
          </div>
        ) : null}

        {/* Section: Join code */}
        {home?.type === "shared" && joinCode ? (
          <div className="hmodal__section">
            <div className="hmodal__sectionTitle">
              {t("dashboard.joinCode") ?? "Código para unirse"}
            </div>

            <div className="hmodal__codeRow">
              <div className="hmodal__codeBox" aria-label="Join code">
                <span className="hmodal__code">{joinCode}</span>
              </div>

              {isOwner ? (
                <button
                  className="hmodal__iconBtn"
                  onClick={() => setRotateConfirmOpen(true)}
                  disabled={isConfirmOpen || isBusyConfirm}
                  title={t("dashboard.rotateCode") ?? "Regenerar código"}
                  aria-label="Rotate code"
                >
                  {busy === "rotate" ? "…" : "↻"}
                </button>
              ) : null}

              <button
                className="hmodal__btn hmodal__btn--primary"
                onClick={copyJoinCode}
                disabled={isConfirmOpen || isBusyConfirm}
              >
                {copied
                  ? (t("common.copied") ?? "Copiado ✅")
                  : (t("common.copy") ?? "Copiar")}
              </button>
            </div>

            <div className="hmodal__hint">
              {t("dashboard.joinCodeHint") ??
                "Compártelo con alguien para que se una a este hogar."}
            </div>
          </div>
        ) : null}

        {/* Section: Danger zone */}
        {onLeaveHome && !isOwner ? (
          <div className="hmodal__section dangerZone">
            <div className="hmodal__sectionTitle dangerTitle">
              {t("dashboard.dangerZone") ?? "Zona peligrosa"}
            </div>

            <div className="hmodal__dangerRow">
              <div className="hmodal__dangerText">
                <div className="hmodal__dangerMain">
                  {t("dashboard.leaveHome") ?? "Salir del hogar"}
                </div>
                <div className="hmodal__dangerSub">
                  {t("dashboard.leaveHomeHint") ??
                    "Dejarás de ver las tareas y recompensas de este hogar."}
                </div>
              </div>

              <button
                className="hmodal__btn danger"
                onClick={() => {
                  setKickTarget(null);
                  setLeaveConfirmOpen(true);
                  setRotateConfirmOpen(false);
                }}
                disabled={isConfirmOpen || isBusyConfirm}
              >
                {busy === "leave" ? "…" : (t("dashboard.leave") ?? "Salir")}
              </button>
            </div>
          </div>
        ) : null}

        {/* SCRIM interno */}
        {kickTarget || leaveConfirmOpen || rotateConfirmOpen ? (
          <div className="hmodal__scrim" />
        ) : null}

        {/* CONFIRM INLINE */}
        <ConfirmModal
          inline
          open={!!kickTarget}
          title={t("dashboard.kickConfirmTitle")}
          description={
            kickTarget ? (
              <>
                <div className="cmodal__descMain">
                  {t("dashboard.kickConfirmAction", { name: kickTarget.label })}
                </div>
                <div className="cmodal__descSub">
                  {t("dashboard.kickConfirmConsequence")}
                </div>
              </>
            ) : undefined
          }
          cancelText={t("common.cancel")}
          confirmText={t("dashboard.kickConfirmBtn")}
          danger
          busy={busy === "kick-confirm"}
          onClose={() => {
            if (busy !== "kick-confirm") setKickTarget(null);
          }}
          onConfirm={async () => {
            if (!kickTarget || !onRemoveMember) return;
            try {
              setBusy("kick-confirm");
              await onRemoveMember(kickTarget.uid);
              setKickTarget(null);
            } finally {
              setBusy(null);
            }
          }}
        />

        <ConfirmModal
          inline
          open={leaveConfirmOpen}
          title={t("dashboard.leaveConfirmTitle")}
          description={
            <>
              <div className="cmodal__descMain">
                {t("dashboard.leaveConfirmAction")}
              </div>
              <div className="cmodal__descSub">
                {t("dashboard.leaveConfirmConsequence")}
              </div>
            </>
          }
          cancelText={t("common.cancel")}
          confirmText={t("dashboard.leaveConfirmBtn")}
          danger
          busy={busy === "leave"}
          onClose={() => {
            if (busy !== "leave") setLeaveConfirmOpen(false);
          }}
          onConfirm={async () => {
            if (!onLeaveHome) return;
            try {
              setBusy("leave");
              await onLeaveHome();
              setLeaveConfirmOpen(false);
              onClose();
            } finally {
              setBusy(null);
            }
          }}
        />

        <ConfirmModal
          inline
          open={rotateConfirmOpen}
          title={t("dashboard.rotateCodeTitle")}
          description={
            <div className="rotateCodeConfirm">
              <div className="cmodal__descMain">
                {t("dashboard.rotateCodeAction")}
              </div>

              <div className="rotateCodeConfirm__divider" />

              <div className="cmodal__descSub">
                {t("dashboard.rotateCodeConsequence")}
              </div>
            </div>
          }
          cancelText={t("common.cancel")}
          confirmText={t("common.confirm")}
          busy={busy === "rotate"}
          onClose={() => {
            if (busy !== "rotate") setRotateConfirmOpen(false);
          }}
          onConfirm={async () => {
            if (!homeId) return;
            try {
              setBusy("rotate");
              await rotateHomeJoinCode({ uid: currentUid, homeId });
              setRotateConfirmOpen(false);
              setCopied(false);
            } finally {
              setBusy(null);
            }
          }}
        />
      </div>
    </div>
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.2 3.2 10.4c-.3.26-.4.7-.2 1.06.2.36.58.54.98.45L5 11.74V20a2 2 0 0 0 2 2h4.25v-6.25h1.5V22H17a2 2 0 0 0 2-2v-8.26l1.02.2c.4.09.78-.09.98-.45.2-.36.1-.8-.2-1.06L12 3.2z"
      />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.5 12a3.25 3.25 0 1 0-3.25-3.25A3.26 3.26 0 0 0 16.5 12zm-9 0A3.25 3.25 0 1 0 4.25 8.75 3.26 3.26 0 0 0 7.5 12zm9.2 1.5c-1.9 0-5.2.95-5.2 2.85V18.5h10.4v-2.15c0-1.9-3.3-2.85-5.2-2.85zm-9.2 0C5.6 13.5 2 14.45 2 16.35V18.5h8.75v-2.15c0-1.9-3.6-2.85-3.25-2.85z"
      />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12.2a4.1 4.1 0 1 0-4.1-4.1 4.11 4.11 0 0 0 4.1 4.1zm0 1.8c-3.7 0-8 1.86-8 4.75V21h16v-2.25c0-2.89-4.3-4.75-8-4.75z"
      />
    </svg>
  );
}
