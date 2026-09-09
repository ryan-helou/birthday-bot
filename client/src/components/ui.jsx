import { Icon } from "./Icon.jsx";

export function Button({ variant = "primary", icon, children, className = "", ...rest }) {
  const styles = {
    primary: "bg-ink text-paper hover:opacity-90",
    accent: "bg-accent text-white hover:opacity-90",
    ghost: "text-ink hover:bg-accent-soft",
    outline: "border border-line text-ink hover:bg-accent-soft",
    danger: "border border-line text-ink hover:bg-red-50 hover:text-red-700 hover:border-red-200",
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
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
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink " +
  "placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function Banner({ tone = "info", children, onDismiss }) {
  const tones = {
    info: "border-line bg-card text-ink",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  const icon = { info: "info", success: "check", error: "alert" }[tone];

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${tones}`} role="status">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 leading-relaxed">{children}</div>
      {onDismiss ? (
        <button onClick={onDismiss} className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Dismiss">
          <Icon name="close" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:pb-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-accent-soft hover:text-ink" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <Icon name={icon} className="mx-auto size-8 text-muted" />
      <p className="mt-3 font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
