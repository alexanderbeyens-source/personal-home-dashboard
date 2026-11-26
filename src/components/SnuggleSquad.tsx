import { useEffect, useId, useRef, useState } from "react";

const TOOLTIP = "Snuggletime!!!";
const TOOLTIP_MS = 1600;

type Buddy = "big-panda" | "baby-panda" | "pig";

const BUDDIES: { kind: Buddy; label: string }[] = [
  { kind: "big-panda", label: "Grote panda" },
  { kind: "baby-panda", label: "Kleine panda" },
  { kind: "pig", label: "Varken" },
];

function PandaFace() {
  return (
    <>
      <circle cx="8" cy="8" r="5" className="snuggle-dark" />
      <circle cx="24" cy="8" r="5" className="snuggle-dark" />
      <circle cx="16" cy="17.5" r="12" fill="#f7f8fb" />
      <ellipse cx="11" cy="16.5" rx="3.2" ry="4.2" transform="rotate(25 11 16.5)" fill="#20242d" />
      <ellipse cx="21" cy="16.5" rx="3.2" ry="4.2" transform="rotate(-25 21 16.5)" fill="#20242d" />
      <circle cx="11.6" cy="15.6" r="1.2" fill="#fff" />
      <circle cx="20.4" cy="15.6" r="1.2" fill="#fff" />
      <ellipse cx="16" cy="21.6" rx="2" ry="1.4" fill="#20242d" />
      <path d="M14.2 23.6q1.8 1.6 3.6 0" stroke="#20242d" strokeWidth="1" fill="none" strokeLinecap="round" />
      <circle cx="8.6" cy="22" r="1.7" fill="#ff9db5" opacity="0.75" />
      <circle cx="23.4" cy="22" r="1.7" fill="#ff9db5" opacity="0.75" />
    </>
  );
}

function PigFace() {
  return (
    <>
      <path d="M5 4.5l7.5 4.5-6 5z" fill="#f48aa8" />
      <path d="M27 4.5l-7.5 4.5 6 5z" fill="#f48aa8" />
      <circle cx="16" cy="17.5" r="12" fill="#ffb8cb" />
      <circle cx="11" cy="14.5" r="1.5" fill="#20242d" />
      <circle cx="21" cy="14.5" r="1.5" fill="#20242d" />
      <circle cx="11.5" cy="14" r="0.5" fill="#fff" />
      <circle cx="21.5" cy="14" r="0.5" fill="#fff" />
      <ellipse cx="16" cy="21" rx="5" ry="3.6" fill="#f48aa8" />
      <ellipse cx="14.2" cy="21" rx="1" ry="1.4" fill="#b8506f" />
      <ellipse cx="17.8" cy="21" rx="1" ry="1.4" fill="#b8506f" />
      <circle cx="7.6" cy="20" r="1.6" fill="#ff7f9f" opacity="0.6" />
      <circle cx="24.4" cy="20" r="1.6" fill="#ff7f9f" opacity="0.6" />
    </>
  );
}

function SnuggleBuddy({ kind, label }: { kind: Buddy; label: string }) {
  const tooltipId = useId();
  const [play, setPlay] = useState(0);
  const [showTip, setShowTip] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function snuggle() {
    // Changing the key remounts the art so the animation restarts on every click/tap.
    setPlay((count) => count + 1);
    setShowTip(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShowTip(false), TOOLTIP_MS);
  }

  return (
    <button
      type="button"
      className={`snuggle-buddy is-${kind}${showTip ? " is-snuggling" : ""}`}
      aria-label={label}
      aria-describedby={tooltipId}
      onClick={snuggle}
    >
      <span key={play} className="snuggle-art" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          {kind === "pig" ? <PigFace /> : <PandaFace />}
        </svg>
      </span>
      <span id={tooltipId} role="tooltip" className="snuggle-tooltip">{TOOLTIP}</span>
    </button>
  );
}

export function SnuggleSquad() {
  return (
    <div className="snuggle-squad">
      {BUDDIES.map((buddy) => (
        <SnuggleBuddy key={buddy.kind} {...buddy} />
      ))}
    </div>
  );
}
