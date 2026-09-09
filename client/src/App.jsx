import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api.js";
import { getExistingSubscription } from "./lib/push.js";
import { countdown, groupByHorizon, monthDay, turningLabel } from "./lib/format.js";
import { Icon } from "./components/Icon.jsx";
import { Banner, Button, EmptyState, inputClass } from "./components/ui.jsx";
import { ContactCard } from "./components/ContactCard.jsx";
import { ContactForm } from "./components/ContactForm.jsx";
import { ImportPanel } from "./components/ImportPanel.jsx";
import { NotificationSettings } from "./components/NotificationSettings.jsx";

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(null); // "add" | "import" | "notifications"
  const [editing, setEditing] = useState(null);
  const [pushOn, setPushOn] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listContacts();
      setContacts(data.contacts);
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getExistingSubscription().then((s) => setPushOn(Boolean(s))).catch(() => {}); }, [dialog]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(needle) ||
        monthDay(contact).toLowerCase().includes(needle) ||
        (contact.notes ?? "").toLowerCase().includes(needle),
    );
  }, [contacts, query]);

  const groups = useMemo(() => groupByHorizon(filtered), [filtered]);
  const todays = contacts.filter((contact) => contact.daysUntil === 0);
  const next = contacts[0];

  async function handleDelete(contact) {
    if (!window.confirm(`Remove ${contact.name}?`)) return;
    await api.deleteContact(contact.id);
    await load();
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-paper">
            <Icon name="cake" className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-none tracking-tight">Birthday Bot</h1>
            <p className="mt-1 text-xs text-muted">
              {contacts.length} {contacts.length === 1 ? "birthday" : "birthdays"} tracked
            </p>
          </div>
        </div>

        <button
          onClick={() => setDialog("notifications")}
          className="relative rounded-full border border-line p-2.5 text-ink transition hover:bg-accent-soft"
          aria-label="Notification settings"
        >
          <Icon name={pushOn ? "bell" : "bellOff"} className="size-5" />
          {pushOn ? (
            <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" aria-hidden="true" />
          ) : null}
        </button>
      </header>

      {todays.length > 0 ? (
        <section className="mt-2 rounded-2xl border border-accent/40 bg-accent-soft px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Today</p>
          <p className="mt-1.5 text-[17px] font-medium leading-snug text-ink">
            {todays
              .map((c) => (c.turningAge != null ? `${c.name} turns ${c.turningAge}` : `${c.name}'s birthday`))
              .join(" · ")}
          </p>
        </section>
      ) : next ? (
        <section className="mt-2 rounded-2xl border border-line bg-card px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Up next</p>
          <p className="mt-1.5 text-[17px] font-medium leading-snug text-ink">
            {next.name} · {monthDay(next)}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {countdown(next.daysUntil)} · {turningLabel(next)}
          </p>
        </section>
      ) : null}

      <div className="sticky top-0 z-20 -mx-4 mt-5 bg-paper px-4 pb-3 pt-1 sm:-mx-6 sm:px-6">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className={`${inputClass} pl-10`}
            placeholder="Search names, dates, notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
          />
        </div>
      </div>

      {error ? <div className="mb-4"><Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner></div> : null}

      <main className="pb-6">
        {loading ? (
          <p className="py-12 text-center text-sm text-muted">Loading…</p>
        ) : contacts.length === 0 ? (
          <EmptyState icon="cake" title="No birthdays yet">
            Add someone by hand, or import a CSV/JSON export to fill the list in one go.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="Nothing matches">
            No one here matches “{query}”.
          </EmptyState>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
                  {group.label}
                  <span className="ml-2 font-normal normal-case tracking-normal opacity-70">
                    {group.contacts.length}
                  </span>
                </h2>
                <ul className="space-y-2">
                  {group.contacts.map((contact) => (
                    <ContactCard
                      key={contact.id}
                      contact={contact}
                      onEdit={(target) => { setEditing(target); setDialog("edit"); }}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      {/*
        Fixed, not sticky: inside an installed web app a sticky bar can fail to
        resolve its containing block's height and strand itself mid-screen.
        No backdrop-blur either — a blurred fixed bar detaches during iOS
        momentum scrolling.
      */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card px-4 pb-[env(safe-area-inset-bottom)] sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-center gap-2 py-3">
          <Button variant="accent" icon="plus" onClick={() => { setEditing(null); setDialog("add"); }}>
            Add birthday
          </Button>
          <Button variant="outline" icon="upload" onClick={() => setDialog("import")}>
            Import
          </Button>
        </div>
      </nav>

      {dialog === "add" || dialog === "edit" ? (
        <ContactForm
          contact={dialog === "edit" ? editing : null}
          onClose={() => { setDialog(null); setEditing(null); }}
          onSubmit={async (payload) => {
            if (dialog === "edit") await api.updateContact(editing.id, payload);
            else await api.createContact(payload);
            await load();
          }}
        />
      ) : null}

      {dialog === "import" ? (
        <ImportPanel onClose={() => setDialog(null)} onImported={load} />
      ) : null}

      {dialog === "notifications" ? (
        <NotificationSettings onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
