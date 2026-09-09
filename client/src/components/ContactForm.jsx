import { useEffect, useState } from "react";
import { Button, Field, Modal, fieldClass } from "./ui.jsx";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Add / edit a contact.
 *
 * The birth year is optional on purpose: an imported Snapchat birthday is a
 * month and a day, and forcing a made-up year would put a wrong age in the
 * notification. With the year left blank the reminder simply omits the age.
 */
export function ContactForm({ contact, onSubmit, onClose }) {
  const [name, setName] = useState("");
  const [month, setMonth] = useState("1");
  const [day, setDay] = useState("1");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contact) return;
    setName(contact.name);
    setMonth(String(contact.birthMonth));
    setDay(String(contact.birthDay));
    setYear(contact.yearKnown ? contact.birthdate.slice(0, 4) : "");
    setNotes(contact.notes ?? "");
  }, [contact]);

  const daysInMonth = new Date(Date.UTC(Number(year) || 2024, Number(month), 0)).getUTCDate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Give them a name.");
    if (Number(day) > daysInMonth) {
      return setError(`${MONTHS[Number(month) - 1]} only has ${daysInMonth} days.`);
    }

    const pad = (value) => String(value).padStart(2, "0");
    const birthdate = year.trim()
      ? `${year.trim()}-${pad(month)}-${pad(day)}`
      : `${pad(month)}-${pad(day)}`;

    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), birthdate, notes: notes.trim() });
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={contact ? "Edit contact" : "Add a birthday"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ava Bennett"
            autoFocus
            required
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Birthday</span>
          <div className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-2">
            <select className={fieldClass} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              {MONTHS.map((label, index) => (
                <option key={label} value={index + 1}>{label}</option>
              ))}
            </select>
            <select className={fieldClass} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day">
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <input
              className={fieldClass}
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Year"
              inputMode="numeric"
              aria-label="Birth year (optional)"
            />
          </div>
          <span className="mt-1.5 block text-xs text-muted">
            Leave the year blank if you don't know it — the reminder just skips the age.
          </span>
        </div>

        <Field label="Notes" hint="Optional. Gift ideas, how you know them, anything.">
          <textarea
            className={`${fieldClass} min-h-20 resize-y`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Loves cold-brew. Met at camp."
          />
        </Field>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="accent" disabled={saving}>
            {saving ? "Saving…" : contact ? "Save changes" : "Add birthday"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
