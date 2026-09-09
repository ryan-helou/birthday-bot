/**
 * Civil-date helpers.
 *
 * Everything here works on a plain `{ year, month, day }` civil date, never on a
 * timestamp interpreted in the OS timezone. A Railway container has no `TZ` and
 * runs in UTC, so `new Date().getDate()` there is the UTC day and rolls over at
 * 20:00 in Montreal. The server's notion of "today" is therefore derived from a
 * NAMED zone via Intl, which makes correctness a property of the app rather than
 * of whoever remembered to set an environment variable.
 */

export const MS_PER_DAY = 86_400_000;

/**
 * Placeholder year used when only a month/day is known (Snapchat's birthday
 * list gives exactly that). 1904 is a leap year, so Feb 29 is representable.
 * Never read this year for an age — go through `ageTurningOn`, which checks
 * `yearKnown` first.
 */
export const UNKNOWN_BIRTH_YEAR = 1904;

const pad2 = (n) => String(n).padStart(2, "0");

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Today's civil date in a named IANA zone, independent of the container's TZ. */
export function civilToday(timeZone, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** "yyyy-mm-dd" for a civil date. Safe to compare and to store as a key. */
export function dayKey({ year, month, day }) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * The day a month/day birthday is *observed* in a given year.
 * Feb 29 in a common year is observed on Feb 28, so the reminder still lands in
 * the birth month rather than slipping into March.
 */
export function observedDayInYear(month, day, year) {
  if (month === 2 && day === 29 && !isLeapYear(year)) return { month: 2, day: 28 };
  return { month, day };
}

/** 0 when the birthday is today, otherwise days until its next occurrence. */
export function daysUntilBirthday(month, day, today) {
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);
  for (const year of [today.year, today.year + 1]) {
    const observed = observedDayInYear(month, day, year);
    const ms = Date.UTC(year, observed.month - 1, observed.day);
    if (ms >= todayMs) return Math.round((ms - todayMs) / MS_PER_DAY);
  }
  /* c8 ignore next */
  return 0;
}

/** The calendar year the next occurrence of this birthday falls in. */
export function nextBirthdayYear(month, day, today) {
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);
  for (const year of [today.year, today.year + 1]) {
    const observed = observedDayInYear(month, day, year);
    if (Date.UTC(year, observed.month - 1, observed.day) >= todayMs) return year;
  }
  /* c8 ignore next */
  return today.year;
}

/** Age the contact turns on a given calendar year, or null if the year is unknown. */
export function ageTurningOn(contact, year) {
  if (!contact.yearKnown) return null;
  const birthYear = new Date(contact.birthdate).getUTCFullYear();
  const age = year - birthYear;
  return Number.isFinite(age) ? age : null;
}

/**
 * Contacts whose birthday is observed today. Normally an exact month/day match;
 * on Feb 28 of a common year it also picks up the Feb 29 people.
 */
export function birthdayWhereForToday(today) {
  const matches = [{ birthMonth: today.month, birthDay: today.day }];
  if (today.month === 2 && today.day === 28 && !isLeapYear(today.year)) {
    matches.push({ birthMonth: 2, birthDay: 29 });
  }
  return { OR: matches };
}

const MONTH_NAMES = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function build(year, month, day) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1) return null;
  const yearKnown = year != null;
  const effectiveYear = yearKnown ? year : UNKNOWN_BIRTH_YEAR;
  if (day > daysInMonth(effectiveYear, month)) return null;
  if (yearKnown && (year < 1900 || year > new Date().getUTCFullYear())) return null;
  return {
    month,
    day,
    yearKnown,
    // Stored as a DATE at UTC midnight — Prisma's @db.Date round-trips this
    // exactly, with no timezone able to shift it a day either way.
    birthdate: new Date(Date.UTC(effectiveYear, month - 1, day)),
  };
}

/**
 * Parse the many shapes a birthday arrives in — a form field, a CSV cell, a JSON
 * export. Returns `{ birthdate, month, day, yearKnown }` or null.
 *
 * Accepts: 1999-03-14 · 03/14/1999 · 14/03/1999 (day-first when > 12) ·
 * March 14 1999 · 14 March · 03-14 · 3/14 · a Date · an ISO timestamp.
 * A missing year is not an error: it sets `yearKnown: false`.
 */
export function parseBirthdateInput(value) {
  if (value == null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return build(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // ISO date or timestamp: 1999-03-14, 1999-03-14T00:00:00.000Z
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));

  // Month name forms: "March 14, 1999", "14 March 1999", "March 14"
  const words = raw.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const nameIndex = words.findIndex((w) => w in MONTH_NAMES);
  if (nameIndex !== -1) {
    const month = MONTH_NAMES[words[nameIndex]];
    const numbers = words
      .filter((_, i) => i !== nameIndex)
      .map((w) => Number(w.replace(/(st|nd|rd|th)$/, "")))
      .filter((n) => Number.isInteger(n));
    const day = numbers.find((n) => n >= 1 && n <= 31);
    const year = numbers.find((n) => n >= 1900);
    if (day != null) return build(year ?? null, month, day);
    return null;
  }

  // Slash / dash / dot separated numbers.
  const parts = raw.split(/[/\-.]/).map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);

  if (nums.length === 3) {
    const [a, b, c] = nums;
    if (parts[2].length === 4) {
      // a/b/1999 — month-first unless the first number cannot be a month.
      return a > 12 ? build(c, b, a) : build(c, a, b);
    }
    if (parts[0].length === 4) return build(a, b, c); // 1999/03/14
    return null;
  }

  if (nums.length === 2) {
    const [a, b] = nums;
    // Month/day with no year — the common Snapchat case.
    return a > 12 ? build(null, b, a) : build(null, a, b);
  }

  return null;
}

/** The DB columns for a contact, derived from whatever birthdate shape came in. */
export function contactFieldsFromInput({ name, birthdate, notes }) {
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) return { error: "name is required" };

  const parsed = parseBirthdateInput(birthdate);
  if (!parsed) return { error: "birthdate is required and must be a real date" };

  return {
    fields: {
      name: cleanName,
      birthdate: parsed.birthdate,
      birthMonth: parsed.month,
      birthDay: parsed.day,
      yearKnown: parsed.yearKnown,
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    },
  };
}

/** Shape a contact row for the API, with the derived countdown fields. */
export function decorateContact(contact, today) {
  const daysUntil = daysUntilBirthday(contact.birthMonth, contact.birthDay, today);
  const year = nextBirthdayYear(contact.birthMonth, contact.birthDay, today);
  return {
    id: contact.id,
    name: contact.name,
    birthdate: contact.birthdate.toISOString().slice(0, 10),
    birthMonth: contact.birthMonth,
    birthDay: contact.birthDay,
    yearKnown: contact.yearKnown,
    notes: contact.notes,
    daysUntil,
    nextBirthdayYear: year,
    turningAge: ageTurningOn(contact, year),
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}
