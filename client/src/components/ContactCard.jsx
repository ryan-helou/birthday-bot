import { Icon } from "./Icon.jsx";
import { countdown, monthDay, turningLabel } from "../lib/format.js";

export function ContactCard({ contact, onEdit, onDelete }) {
  const isToday = contact.daysUntil === 0;

  return (
    <li
      className={`group flex items-center gap-3.5 rounded-card border px-4 py-3.5 transition ${
        isToday ? "border-accent/40 bg-accent-soft" : "border-line bg-card hover:border-accent/30"
      }`}
    >
      <div
        className={`flex size-11 shrink-0 flex-col items-center justify-center rounded-xl border text-center leading-none ${
          isToday ? "border-accent/40 bg-card text-accent" : "border-line bg-paper text-ink"
        }`}
        aria-hidden="true"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {monthDay(contact).slice(0, 3)}
        </span>
        <span className="mt-0.5 text-base font-semibold tabular-nums">{contact.birthDay}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium text-ink">{contact.name}</p>
          {isToday ? <Icon name="cake" className="size-4 shrink-0 text-accent" /> : null}
        </div>
        {/* The date tile already shows the day, so the subtitle leads with the
            age and lets only the notes truncate — otherwise the age is the first
            thing lost on a narrow screen. */}
        <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-sm text-muted">
          <span className="shrink-0">{turningLabel(contact)}</span>
          <span className="hidden shrink-0 opacity-40 sm:inline">·</span>
          <span className="hidden shrink-0 sm:inline">{monthDay(contact)}</span>
          {contact.notes ? (
            <>
              <span className="shrink-0 opacity-40">·</span>
              <span className="truncate">{contact.notes}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span
          className={`mr-1 hidden text-sm font-medium tabular-nums sm:inline ${
            isToday ? "text-accent" : "text-muted"
          }`}
        >
          {countdown(contact.daysUntil)}
        </span>
        <button
          onClick={() => onEdit(contact)}
          className="rounded-full p-2 text-muted transition hover:bg-card hover:text-ink"
          aria-label={`Edit ${contact.name}`}
        >
          <Icon name="pencil" className="size-4" />
        </button>
        <button
          onClick={() => onDelete(contact)}
          className="rounded-full p-2 text-muted transition hover:bg-card hover:text-red-600"
          aria-label={`Delete ${contact.name}`}
        >
          <Icon name="trash" className="size-4" />
        </button>
      </div>
    </li>
  );
}
