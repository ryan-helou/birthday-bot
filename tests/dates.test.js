import test from "node:test";
import assert from "node:assert/strict";

import {
  ageTurningOn,
  birthdayWhereForToday,
  civilToday,
  contactFieldsFromInput,
  dayKey,
  daysUntilBirthday,
  isLeapYear,
  nextBirthdayYear,
  observedDayInYear,
  parseBirthdateInput,
  UNKNOWN_BIRTH_YEAR,
} from "../server/lib/dates.js";

test("civilToday derives the day from a named zone, not the container clock", () => {
  // 2026-09-10T02:30Z is still Sep 9 in Montreal and already Sep 10 in Kiritimati.
  // This is the whole Railway-runs-UTC bug in one assertion, and it runs at any hour.
  const instant = new Date("2026-09-10T02:30:00Z");
  assert.equal(dayKey(civilToday("America/Toronto", instant)), "2026-09-09");
  assert.equal(dayKey(civilToday("UTC", instant)), "2026-09-10");
  assert.equal(dayKey(civilToday("Pacific/Kiritimati", instant)), "2026-09-10");
});

test("leap years and February lengths", () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2027), false);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
});

test("Feb 29 is observed on Feb 28 in a common year", () => {
  assert.deepEqual(observedDayInYear(2, 29, 2028), { month: 2, day: 29 });
  assert.deepEqual(observedDayInYear(2, 29, 2027), { month: 2, day: 28 });
});

test("daysUntilBirthday counts to the next occurrence, wrapping the year", () => {
  const today = { year: 2026, month: 9, day: 9 };
  assert.equal(daysUntilBirthday(9, 9, today), 0, "today");
  assert.equal(daysUntilBirthday(9, 10, today), 1, "tomorrow");
  assert.equal(daysUntilBirthday(1, 1, today), 114, "wraps into next year");
  assert.equal(daysUntilBirthday(9, 8, today), 364, "yesterday is nearly a year away");
});

test("a Feb 29 birthday lands on Feb 28 of a common year and Feb 29 of a leap year", () => {
  assert.equal(daysUntilBirthday(2, 29, { year: 2027, month: 2, day: 27 }), 1);
  assert.equal(daysUntilBirthday(2, 29, { year: 2027, month: 2, day: 28 }), 0);
  assert.equal(daysUntilBirthday(2, 29, { year: 2028, month: 2, day: 28 }), 1);
});

test("the daily query picks up Feb 29 people on Feb 28 of a common year", () => {
  const common = birthdayWhereForToday({ year: 2027, month: 2, day: 28 });
  assert.deepEqual(common.OR, [
    { birthMonth: 2, birthDay: 28 },
    { birthMonth: 2, birthDay: 29 },
  ]);

  const leap = birthdayWhereForToday({ year: 2028, month: 2, day: 28 });
  assert.deepEqual(leap.OR, [{ birthMonth: 2, birthDay: 28 }]);
});

test("parseBirthdateInput accepts the shapes a real export throws at it", () => {
  const cases = [
    ["1999-03-14", { month: 3, day: 14, yearKnown: true, year: 1999 }],
    ["1999-03-14T00:00:00.000Z", { month: 3, day: 14, yearKnown: true, year: 1999 }],
    ["03/14/1999", { month: 3, day: 14, yearKnown: true, year: 1999 }],
    ["14/03/1999", { month: 3, day: 14, yearKnown: true, year: 1999 }],
    ["1999/03/14", { month: 3, day: 14, yearKnown: true, year: 1999 }],
    ["March 14, 1999", { month: 3, day: 14, yearKnown: true, year: 1999 }],
    ["14 March 1999", { month: 3, day: 14, yearKnown: true, year: 1999 }],
    ["Dec 25", { month: 12, day: 25, yearKnown: false, year: UNKNOWN_BIRTH_YEAR }],
    ["3/14", { month: 3, day: 14, yearKnown: false, year: UNKNOWN_BIRTH_YEAR }],
    ["02-29", { month: 2, day: 29, yearKnown: false, year: UNKNOWN_BIRTH_YEAR }],
  ];

  for (const [input, expected] of cases) {
    const parsed = parseBirthdateInput(input);
    assert.ok(parsed, `expected ${input} to parse`);
    assert.equal(parsed.month, expected.month, input);
    assert.equal(parsed.day, expected.day, input);
    assert.equal(parsed.yearKnown, expected.yearKnown, input);
    assert.equal(parsed.birthdate.getUTCFullYear(), expected.year, input);
    // The stored DATE must be exactly the civil date, at UTC midnight, so no
    // timezone can shift it a day in either direction.
    assert.equal(parsed.birthdate.toISOString().slice(11), "00:00:00.000Z", input);
  }
});

test("a year-less Feb 29 is representable (the placeholder year is a leap year)", () => {
  const parsed = parseBirthdateInput("02-29");
  assert.equal(parsed.birthdate.toISOString().slice(0, 10), "1904-02-29");
  assert.equal(isLeapYear(UNKNOWN_BIRTH_YEAR), true);
});

test("parseBirthdateInput rejects nonsense instead of guessing", () => {
  for (const input of ["", "  ", "garbage", "2/30", "13/40/1999", "1899-01-01", "2099-01-01", null]) {
    assert.equal(parseBirthdateInput(input), null, `expected ${input} to be rejected`);
  }
});

test("ageTurningOn is null when the birth year was never known", () => {
  const known = { yearKnown: true, birthdate: new Date(Date.UTC(1999, 2, 14)) };
  const unknown = { yearKnown: false, birthdate: new Date(Date.UTC(UNKNOWN_BIRTH_YEAR, 2, 14)) };
  assert.equal(ageTurningOn(known, 2026), 27);
  assert.equal(ageTurningOn(unknown, 2026), null);
});

test("nextBirthdayYear rolls over so the age is the one they are about to turn", () => {
  const today = { year: 2026, month: 12, day: 31 };
  assert.equal(nextBirthdayYear(1, 5, today), 2027);
  const contact = { yearKnown: true, birthdate: new Date(Date.UTC(2000, 0, 5)) };
  assert.equal(ageTurningOn(contact, nextBirthdayYear(1, 5, today)), 27);
});

test("contactFieldsFromInput validates and derives the indexed columns", () => {
  const { fields } = contactFieldsFromInput({ name: "  Ava Bennett ", birthdate: "1999-03-14", notes: " camp " });
  assert.equal(fields.name, "Ava Bennett");
  assert.equal(fields.birthMonth, 3);
  assert.equal(fields.birthDay, 14);
  assert.equal(fields.yearKnown, true);
  assert.equal(fields.notes, "camp");

  assert.match(contactFieldsFromInput({ name: "", birthdate: "1999-03-14" }).error, /name/);
  assert.match(contactFieldsFromInput({ name: "Ava", birthdate: "nope" }).error, /birthdate/);
  assert.equal(contactFieldsFromInput({ name: "Ava", birthdate: "3/14", notes: "" }).fields.notes, null);
});
