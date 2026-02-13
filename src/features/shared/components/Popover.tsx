import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import "./Popover.css";

type Placement = "top" | "bottom";

export function Popover(props: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  placement?: Placement;
  align?: "start" | "end";
  offsetPx?: number;
}) {
  const {
    open,
    anchorEl,
    onClose,
    title,
    children,
    placement = "top",
    align = "end",
    offsetPx = 10,
  } = props;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const computeRoughPos = () => {
    if (!open || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const estimatedWidth = 360;
    const leftBase = align === "end" ? r.right - estimatedWidth : r.left;
    const clampedLeft = Math.max(
      12,
      Math.min(leftBase, window.innerWidth - estimatedWidth - 12),
    );
    const topRough =
      placement === "top" ? r.top - offsetPx : r.bottom + offsetPx;

    setPos({ top: topRough, left: clampedLeft });
  };

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const panel = panelRef.current;

      if (panel && target && panel.contains(target)) return;
      if (anchorEl && target && anchorEl.contains(target)) return;

      onClose();
    };

    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [open, onClose, anchorEl]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    computeRoughPos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorEl, placement, align, offsetPx]);

  useEffect(() => {
    if (!open) return;

    const onReflow = () => computeRoughPos();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);

    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorEl, placement, align, offsetPx]);

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;

    const el = panelRef.current;
    if (!el) return;

    const panelRect = el.getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();

    const desiredLeft = align === "end" ? ar.right - panelRect.width : ar.left;
    const desiredTop =
      placement === "top"
        ? ar.top - offsetPx - panelRect.height
        : ar.bottom + offsetPx;

    const clampedLeft = Math.max(
      12,
      Math.min(desiredLeft, window.innerWidth - panelRect.width - 12),
    );
    const clampedTop = Math.max(
      12,
      Math.min(desiredTop, window.innerHeight - panelRect.height - 12),
    );

    setPos((prev) => {
      if (prev && prev.top === clampedTop && prev.left === clampedLeft)
        return prev;
      return { top: clampedTop, left: clampedLeft };
    });
  }, [open, anchorEl, placement, align, offsetPx]);

  if (!open || !anchorEl || !pos) return null;

  return createPortal(
    <div className="pop__layer" role="dialog" aria-modal="false">
      <div
        ref={panelRef}
        className={`pop__panel pop__panel--${placement}`}
        style={{ top: pos.top, left: pos.left }}
      >
        {title && <div className="pop__title">{title}</div>}
        <div className="pop__content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
