"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import styles from "./skills.module.css";

export function SkillCardDescription({ name, description }: { name: string; description: string }) {
  const id = useId();
  const [position, setPosition] = useState<CSSProperties>();
  const hideTimer = useRef<number | undefined>(undefined);

  function close() {
    window.clearTimeout(hideTimer.current);
    setPosition(undefined);
  }

  function show(anchor: HTMLButtonElement) {
    window.clearTimeout(hideTimer.current);
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    setPosition({
      width,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      ...(rect.bottom < window.innerHeight / 2
        ? { top: rect.bottom + 4 }
        : { bottom: window.innerHeight - rect.top + 4 }),
    });
  }

  function scheduleClose() { hideTimer.current = window.setTimeout(close, 150); }

  useEffect(() => {
    if (!position) return;
    function dismiss() {
      window.clearTimeout(hideTimer.current);
      setPosition(undefined);
    }
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") dismiss(); }
    function onScroll(event: Event) {
      if (!(event.target instanceof Element) || !event.target.closest("[data-skill-description]")) dismiss();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.clearTimeout(hideTimer.current);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [position]);

  if (!description) return <span className={styles.cardDescription}>No description</span>;

  return <>
    <button type="button" className={styles.cardDescription} aria-label={`Description for ${name}`}
      aria-describedby={position ? id : undefined}
      onMouseEnter={(event) => show(event.currentTarget)} onMouseLeave={scheduleClose}
      onFocus={(event) => show(event.currentTarget)} onBlur={close}
      onClick={(event) => show(event.currentTarget)}>{description}</button>
    {position && createPortal(
      <div id={id} role="tooltip" data-skill-description className={styles.descriptionPopover} style={position}
        onMouseEnter={() => window.clearTimeout(hideTimer.current)} onMouseLeave={close}>
        <strong>{name}</strong>
        <p>{description}</p>
      </div>, document.body,
    )}
  </>;
}
