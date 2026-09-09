/**
 * Bulk-import parsing for exported contact lists.
 *
 * Worth knowing: Snapchat's official "My Data" export does NOT contain
 * birthdays — `friends.json` only has username, display name and dates the
 * friendship changed. The birthdays live in the app's Friends > Birthdays list.
 * So this parser is deliberately shape-tolerant: it takes any CSV or JSON where
 * some column looks like a name and some column looks like a birthday, and it
 * accepts month/day with no year, which is all Snapchat ever shows.
 */

import { parseBirthdateInput } from "./dates.js";

const NAME_KEYS = [
  "name", "display name", "displayname", "display_name", "full name", "fullname",
  "full_name", "friend", "friend name", "contact", "contact name", "username",
  "user name", "user_name", "handle", "nickname", "first name",
];

const BIRTHDAY_KEYS = [
  "birthday", "birthdate", "birth date", "birth_date", "birthday date", "dob",
  "d.o.b.", "date of birth", "bday", "b-day", "born", "birth",
];

const NOTE_KEYS = ["notes", "note", "comment", "comments", "description", "about", "memo"];

const normalizeKey = (key) => String(key).trim().toLowerCase().replace(/[_\s]+/g, " ");

function pick(record, candidates) {
  for (const candidate of candidates) {
    for (const [key, value] of Object.entries(record)) {
      if (normalizeKey(key) === candidate && value != null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return null;
}

/**
 * Minimal RFC 4180 CSV reader — handles quoted fields containing commas,
 * newlines and doubled quotes. Also accepts semicolon and tab delimiters, which
 * is what a European-locale spreadsheet export produces.
 */
export function parseCsv(text) {
  const source = text.replace(/^﻿/, "");
  const headerLine = source.slice(0, source.search(/\r?\n/) === -1 ? source.length : source.search(/\r?\n/));
  const delimiter = [",", ";", "\t"]
    .map((d) => ({ d, count: headerLine.split(d).length }))
    .sort((a, b) => b.count - a.count)[0].d;

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === delimiter) { row.push(field); field = ""; continue; }
    if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (char === "\r") continue;
    field += char;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return [];

  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? "").trim()])),
  );
}

/** Find the array of records inside an arbitrarily nested export JSON. */
function findRecordArray(value, depth = 0) {
  if (Array.isArray(value)) {
    return value.every((item) => item && typeof item === "object" && !Array.isArray(item)) ? value : null;
  }
  if (!value || typeof value !== "object" || depth > 4) return null;

  // Prefer a key that sounds like a friend list before falling back to any array.
  const entries = Object.entries(value);
  const preferred = entries.filter(([key]) =>
    /friend|contact|people|person|birthday|entries|items|data/i.test(key),
  );
  for (const [, nested] of [...preferred, ...entries]) {
    const found = findRecordArray(nested, depth + 1);
    if (found?.length) return found;
  }
  return null;
}

export function parseJsonRecords(text) {
  const parsed = JSON.parse(text);
  return findRecordArray(parsed) ?? [];
}

/**
 * Turn a raw file into `{ rows, skipped }`.
 * `rows` are ready for `contactFieldsFromInput`; `skipped` explains every record
 * that was dropped, so the UI can show the user exactly what did not import.
 */
export function parseImportFile(text, filename = "") {
  const trimmed = text.trim();
  const looksJson = /\.json$/i.test(filename) || trimmed.startsWith("{") || trimmed.startsWith("[");

  let records;
  if (looksJson) {
    try {
      records = parseJsonRecords(trimmed);
    } catch (error) {
      throw new Error(`Could not parse JSON: ${error.message}`);
    }
  } else {
    records = parseCsv(text);
  }

  const rows = [];
  const skipped = [];

  records.forEach((record, index) => {
    if (!record || typeof record !== "object") return;
    const flat = flatten(record);
    const name = pick(flat, NAME_KEYS);
    const birthdayRaw = pick(flat, BIRTHDAY_KEYS);

    if (!name && !birthdayRaw) return; // an entirely blank row is not an error
    if (!name) { skipped.push({ index, reason: "no name column found", record: preview(flat) }); return; }
    if (!birthdayRaw) { skipped.push({ index, name, reason: "no birthday column found" }); return; }

    const parsed = parseBirthdateInput(birthdayRaw);
    if (!parsed) { skipped.push({ index, name, reason: `unrecognised date "${birthdayRaw}"` }); return; }

    rows.push({ name, birthdate: birthdayRaw, notes: pick(flat, NOTE_KEYS) });
  });

  return { rows, skipped, total: records.length };
}

/** Flatten one level of nesting so `{ friend: { name, birthday } }` still works. */
function flatten(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (nestedValue == null || typeof nestedValue === "object") continue;
        if (!(nestedKey in out)) out[nestedKey] = nestedValue;
      }
    } else if (!Array.isArray(value)) {
      out[key] = value;
    }
  }
  return out;
}

function preview(record) {
  return Object.fromEntries(Object.entries(record).slice(0, 4));
}
