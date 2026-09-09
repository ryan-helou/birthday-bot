import test from "node:test";
import assert from "node:assert/strict";

import { parseCsv, parseImportFile, parseJsonRecords } from "../server/lib/import-parser.js";

test("parseCsv handles quoted fields with commas, newlines and doubled quotes", () => {
  const csv = 'Name,Birthday,Notes\n"Bennett, Ava",1999-03-14,"Said ""hi""\nat camp"\nNoah,12-25,\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Name, "Bennett, Ava");
  assert.equal(rows[0].Notes, 'Said "hi"\nat camp');
  assert.equal(rows[1].Birthday, "12-25");
});

test("parseCsv picks the delimiter a European export actually used", () => {
  const rows = parseCsv("Name;Birthday\nAva;1999-03-14\n");
  assert.deepEqual(rows, [{ Name: "Ava", Birthday: "1999-03-14" }]);
});

test("parseCsv strips a UTF-8 BOM so the first header still matches", () => {
  const rows = parseCsv("﻿Name,Birthday\nAva,3/14\n");
  assert.equal(rows[0].Name, "Ava");
});

test("parseJsonRecords finds the friends array wherever the export buried it", () => {
  const nested = { "Friends": { "Confirmed Friends": [{ "Display Name": "Mia", Birthday: "August 2" }] } };
  assert.deepEqual(parseJsonRecords(JSON.stringify(nested)), [{ "Display Name": "Mia", Birthday: "August 2" }]);
  assert.equal(parseJsonRecords(JSON.stringify([{ name: "Leo", dob: "1998-06-30" }])).length, 1);
});

test("column names are matched loosely across the shapes exports use", () => {
  const variants = [
    "Name,Birthday\nAva,3/14",
    "Display Name,DOB\nAva,3/14",
    "display_name,date of birth\nAva,3/14",
    "USERNAME,B-Day\nAva,3/14",
  ];
  for (const csv of variants) {
    const { rows } = parseImportFile(csv, "x.csv");
    assert.equal(rows.length, 1, csv);
    assert.equal(rows[0].name, "Ava", csv);
  }
});

test("every dropped record is reported with a reason, and blank rows are not errors", () => {
  const csv = "Name,Birthday\nAva,03/14/1999\nBroken,not a date\nNoName,\n,,\n";
  const { rows, skipped, total } = parseImportFile(csv, "x.csv");
  assert.equal(total, 3, "the entirely blank line is not counted as a record");
  assert.equal(rows.length, 1);
  assert.equal(skipped.length, 2);
  assert.match(skipped[0].reason, /unrecognised date/);
  assert.match(skipped[1].reason, /no birthday column/);
});

test("a month/day with no year imports rather than failing — that is all Snapchat shows", () => {
  const { rows, skipped } = parseImportFile("Name,Birthday\nAva,March 14\nLeo,8/2\n", "x.csv");
  assert.equal(skipped.length, 0);
  assert.equal(rows.length, 2);
});

test("JSON is detected from content even when the filename lies", () => {
  const { rows } = parseImportFile('[{"name":"Ava","birthday":"3/14"}]', "export.txt");
  assert.equal(rows.length, 1);
});

test("malformed JSON reports what went wrong instead of throwing a raw parse error", () => {
  assert.throws(() => parseImportFile("{ not json", "x.json"), /Could not parse JSON/);
});
