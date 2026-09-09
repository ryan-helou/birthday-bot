import { Router } from "express";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import {
  civilToday,
  contactFieldsFromInput,
  daysUntilBirthday,
  decorateContact,
} from "../lib/dates.js";

export const contactsRouter = Router();

/**
 * GET /api/contacts
 * Every contact, ordered by how soon the birthday is. The ordering is derived
 * in JS rather than SQL because "days until" wraps around the year end.
 */
contactsRouter.get("/", async (req, res) => {
  const today = civilToday(env.timeZone);
  const contacts = await prisma.contact.findMany();
  const decorated = contacts
    .map((contact) => decorateContact(contact, today))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));

  const limit = Number(req.query.limit);
  res.json({
    today: today,
    timeZone: env.timeZone,
    count: decorated.length,
    contacts: Number.isInteger(limit) && limit > 0 ? decorated.slice(0, limit) : decorated,
  });
});

contactsRouter.get("/:id", async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  res.json(decorateContact(contact, civilToday(env.timeZone)));
});

contactsRouter.post("/", async (req, res) => {
  const { fields, error } = contactFieldsFromInput(req.body ?? {});
  if (error) return res.status(400).json({ error });

  try {
    const contact = await prisma.contact.create({ data: fields });
    res.status(201).json(decorateContact(contact, civilToday(env.timeZone)));
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: `${fields.name} already has this birthday saved.` });
    }
    throw err;
  }
});

contactsRouter.put("/:id", async (req, res) => {
  const { fields, error } = contactFieldsFromInput(req.body ?? {});
  if (error) return res.status(400).json({ error });

  try {
    const contact = await prisma.contact.update({ where: { id: req.params.id }, data: fields });
    res.json(decorateContact(contact, civilToday(env.timeZone)));
  } catch (err) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Contact not found" });
    if (err?.code === "P2002") {
      return res.status(409).json({ error: `${fields.name} already has this birthday saved.` });
    }
    throw err;
  }
});

contactsRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Contact not found" });
    throw err;
  }
});

/** GET /api/contacts/upcoming/list?days=30 — the dashboard's default window. */
contactsRouter.get("/upcoming/list", async (req, res) => {
  const today = civilToday(env.timeZone);
  const days = Number.isInteger(Number(req.query.days)) ? Number(req.query.days) : 30;
  const contacts = await prisma.contact.findMany();
  const upcoming = contacts
    .filter((c) => daysUntilBirthday(c.birthMonth, c.birthDay, today) <= days)
    .map((contact) => decorateContact(contact, today))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
  res.json({ days, count: upcoming.length, contacts: upcoming });
});
