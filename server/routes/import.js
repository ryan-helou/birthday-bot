import { Router } from "express";
import multer from "multer";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { parseImportFile } from "../lib/import-parser.js";
import { civilToday, contactFieldsFromInput, decorateContact } from "../lib/dates.js";

export const importRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

/**
 * POST /api/import
 * Accepts either a multipart file upload (field name `file`) or a JSON body of
 * `{ contacts: [...] }` / a bare array — the same endpoint serves the file
 * picker and a paste-in.
 *
 * `dryRun=1` parses and reports without writing, which is what the UI calls
 * first so the user sees the preview before anything is saved.
 */
importRouter.post("/", upload.single("file"), async (req, res) => {
  let rows;
  let skipped = [];
  let total = 0;

  if (req.file) {
    let parsed;
    try {
      parsed = parseImportFile(req.file.buffer.toString("utf8"), req.file.originalname);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    ({ rows, skipped, total } = parsed);
  } else {
    const body = Array.isArray(req.body) ? req.body : req.body?.contacts;
    if (!Array.isArray(body)) {
      return res.status(400).json({
        error: "Upload a CSV/JSON file as `file`, or POST { contacts: [...] }.",
      });
    }
    const parsed = parseImportFile(JSON.stringify(body), "inline.json");
    ({ rows, skipped, total } = parsed);
  }

  const dryRun = req.query.dryRun === "1" || req.body?.dryRun === true;

  const prepared = [];
  for (const row of rows) {
    const { fields, error } = contactFieldsFromInput(row);
    if (error) skipped.push({ name: row.name, reason: error });
    else prepared.push(fields);
  }

  // Collapse duplicates inside the file itself before touching the database.
  const seen = new Map();
  for (const fields of prepared) {
    seen.set(`${fields.name.toLowerCase()}|${fields.birthMonth}|${fields.birthDay}`, fields);
  }
  const unique = [...seen.values()];

  if (dryRun) {
    const today = civilToday(env.timeZone);
    return res.json({
      dryRun: true,
      totalRecords: total,
      willImport: unique.length,
      skipped,
      preview: unique.slice(0, 200).map((fields) =>
        decorateContact({ ...fields, id: "preview", createdAt: new Date(), updatedAt: new Date() }, today),
      ),
    });
  }

  let created = 0;
  let updated = 0;

  // Upsert on (name, month, day) so re-importing the same export is a no-op
  // rather than a second copy of everyone.
  for (const fields of unique) {
    const existing = await prisma.contact.findUnique({
      where: {
        contact_identity: {
          name: fields.name,
          birthMonth: fields.birthMonth,
          birthDay: fields.birthDay,
        },
      },
    });

    if (existing) {
      // Only fill gaps: never let a year-less re-import erase a known birth year
      // or overwrite notes the user typed by hand.
      const data = {};
      if (fields.yearKnown && !existing.yearKnown) {
        data.birthdate = fields.birthdate;
        data.yearKnown = true;
      }
      if (fields.notes && !existing.notes) data.notes = fields.notes;
      if (Object.keys(data).length > 0) {
        await prisma.contact.update({ where: { id: existing.id }, data });
        updated += 1;
      }
    } else {
      await prisma.contact.create({ data: fields });
      created += 1;
    }
  }

  res.status(201).json({
    dryRun: false,
    totalRecords: total,
    created,
    updated,
    unchanged: unique.length - created - updated,
    skipped,
  });
});
