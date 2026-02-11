import { useEffect } from "react";
import type { ReactNode } from "react";
import "./ConfirmModal.css";

export function ConfirmModal(props: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  inline?: boolean;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;

  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const {
    open,
    title,
    description,
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    danger = false,
    busy = false,
    inline = false,
    closeOnEscape = false,
    closeOnBackdrop = false,

    onConfirm,
    onClose,
  } = props;

  useEffect(() => {
    if (!open) return;
    if (inline) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (!closeOnEscape) return;
      if (e.key !== "Escape") return;
      if (busy) return;
      onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, inline, closeOnEscape, busy, onClose]);

  if (!open) return null;

  const safeClose = () => {
    if (busy) return;
    onClose();
  };

  if (inline) {
    return (
      <div
        className="cmodal__inlineWrap"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmodal__panel cmodal__panel--inline" onClick={(e) => e.stopPropagation()}>
          <div className="cmodal__top">
            <div className="cmodal__title">{title}</div>
            <button className="cmodal__close" onClick={safeClose} disabled={busy} aria-label="Close">
              ✕
            </button>
          </div>

          {description ? <div className="cmodal__desc">{description}</div> : null}

          <div className="cmodal__actions">
            <button className="cmodal__btn" onClick={safeClose} disabled={busy}>
              {cancelText}
            </button>

            <button
              className={`cmodal__btn ${danger ? "is-danger" : "is-primary"}`}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? "…" : confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="cmodal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (!closeOnBackdrop) return;
        safeClose();
      }}
    >
      <div className="cmodal__panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmodal__top">
          <div className="cmodal__title">{title}</div>
          <button className="cmodal__close" onClick={safeClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </div>

        {description ? <div className="cmodal__desc">{description}</div> : null}

        <div className="cmodal__actions">
          <button className="cmodal__btn" onClick={safeClose} disabled={busy}>
            {cancelText}
          </button>

          <button
            className={`cmodal__btn ${danger ? "is-danger" : "is-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
