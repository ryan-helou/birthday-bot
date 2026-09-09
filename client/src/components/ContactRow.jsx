import { Icon } from "./Icon.jsx";
import { countdown, turningLabel } from "../lib/format.js";

/**
 * A row, not a card. Border and fill are spent only on the day itself, so the
 * one row that matters is the one that looks different.
 */
export function ContactRow({ contact, onEdit, onDelete }) {
  const isToday = contact.daysUntil === 0;

  // The day is in the left column and the month is the section heading, so the
  // second line carries only what those don't: the age, then the note.
  const subtitle = [
    contact.turningAge != null ? turningLabel(contact) : null,
    contact.notes,
  ].filter(Boolean).join(" · ");

  return (
    <li
      className={`group relative flex items-center gap-4 py-3 pl-1 pr-1 ${
        isToday ? "-mx-3 rounded-lg bg-accent-soft px-4" : ""
      }`}
    >
      <span
        className={`w-7 shrink-0 text-right font-medium tabular-nums ${
          isToday ? "text-accent" : "text-ink"
        }`}
      >
        {contact.birthDay}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`truncate leading-snug ${isToday ? "text-accent" : "text-ink"}`}>
          {contact.name}
        </p>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[13px] leading-snug text-muted">{subtitle}</p>
        ) : null}
      </div>

      <span
        className={`shrink-0 text-[13px] tabular-nums ${isToday ? "text-accent" : "text-faint"}`}
      >
        {countdown(contact.daysUntil)}
      </span>

      {/* Controls stay out of the way until the row is touched or focused. */}
      <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
        <button
          onClick={() => onEdit(contact)}
          className="rounded-md p-1.5 text-faint hover:text-ink"
          aria-label={`Edit ${contact.name}`}
        >
          <Icon name="pencil" className="size-4" />
        </button>
        <button
          onClick={() => onDelete(contact)}
          className="rounded-md p-1.5 text-faint hover:text-accent"
          aria-label={`Remove ${contact.name}`}
        >
          <Icon name="trash" className="size-4" />
        </button>
      </span>
    </li>
  );
}
