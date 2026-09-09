import { Icon } from "./Icon.jsx";

export function Button({ variant = "accent", icon, children, className = "", ...rest }) {
  const styles = {
    accent: "bg-accent text-on-accent hover:opacity-90",
    outline: "border border-line text-ink hover:border-line-firm",
    ghost: "text-muted hover:text-ink",
  }[variant];

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-2 block text-[13px] leading-relaxed text-faint">{hint}</span> : null}
    </label>
  );
}

/* An underline, not a box — the search field reads as part of the page. */
export const inputClass =
  "w-full border-0 border-b border-line bg-transparent px-0 py-2.5 pl-6 text-[15px] " +
  "text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-0";

/* Form fields inside dialogs do get an outline — they're editable objects. */
export const fieldClass =
  "w-full rounded-lg border border-line bg-ground px-3.5 py-2.5 text-[15px] text-ink " +
  "placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";

export function Banner({ tone = "info", children, onDismiss }) {
  const tones = {
    info: "border-line bg-ground text-ink",
    success: "border-accent/25 bg-accent-soft text-ink",
    error: "border-red-300/60 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200",
  }[tone];
  const icon = { info: "info", success: "check", error: "alert" }[tone];

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13.5px] leading-relaxed ${tones}`} role="status">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 opacity-70" />
      <div className="flex-1">{children}</div>
      {onDismiss ? (
        <button onClick={onDismiss} className="shrink-0 rounded p-0.5 opacity-50 hover:opacity-100" aria-label="Dismiss">
          <Icon name="close" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl border border-line bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-6"
      >
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-[22px] leading-none tracking-tight">{title}</h2>
          <button onClick={onClose} className="-mr-2 grid size-10 place-items-center rounded-lg text-faint active:bg-line/60 sm:hover:text-ink" aria-label="Close">
            <Icon name="close" className="size-[18px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }) {
  return (
    <div className="py-16 text-center">
      <Icon name={icon} className="mx-auto size-6 text-faint" />
      <p className="mt-4 font-display text-[20px] tracking-tight text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[38ch] text-[13.5px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}
