import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api.js";
import { getExistingSubscription } from "./lib/push.js";
import { countdown, monthDay } from "./lib/format.js";
import { Icon } from "./components/Icon.jsx";
import { Banner, Button, EmptyState, inputClass } from "./components/ui.jsx";
import { ContactRow } from "./components/ContactRow.jsx";
import { YearMeridian } from "./components/YearMeridian.jsx";
import { ContactForm } from "./components/ContactForm.jsx";
import { ImportPanel } from "./components/ImportPanel.jsx";
import { NotificationSettings } from "./components/NotificationSettings.jsx";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pushOn, setPushOn] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listContacts();
      setContacts(data.contacts);
      setToday(data.today);
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
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        monthDay(c).toLowerCase().includes(needle) ||
        (c.notes ?? "").toLowerCase().includes(needle),
    );
  }, [contacts, query]);

  /* Grouped by the month the birthday actually falls in, starting from the
     current month and wrapping — the order you'd read a calendar from today. */
  const months = useMemo(() => {
    const groups = new Map();
    for (const contact of filtered) {
      // Keyed on the occurrence: a Sept 1 birthday that has already gone by is
      // September of NEXT year, and belongs at the end of the year, not above
      // tomorrow's.
      const key = `${contact.nextBirthdayYear}-${contact.birthMonth}`;
      const list = groups.get(key) ?? [];
      list.push(contact);
      groups.set(key, list);
    }
    return [...groups.values()]
      .map((list) => {
        const sorted = list.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
        return {
          key: `${sorted[0].nextBirthdayYear}-${sorted[0].birthMonth}`,
          month: sorted[0].birthMonth,
          year: sorted[0].nextBirthdayYear,
          contacts: sorted,
          order: sorted[0].daysUntil,
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [filtered]);

  const next = contacts[0];
  const todaysPeople = contacts.filter((c) => c.daysUntil === 0);

  async function handleDelete(contact) {
    if (!window.confirm(`Remove ${contact.name}?`)) return;
    await api.deleteContact(contact.id);
    await load();
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-[26px] leading-none tracking-tight">Birthdays</h1>
        <div className="flex items-center gap-3">
          <span className="text-[13px] tabular-nums text-faint">{contacts.length}</span>
          <button
            onClick={() => setDialog("notifications")}
            className="relative -mr-1.5 rounded-full p-1.5 text-muted transition hover:text-ink"
            aria-label="Notification settings"
          >
            <Icon name={pushOn ? "bell" : "bellOff"} className="size-[18px]" />
            {pushOn ? (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" />
            ) : null}
          </button>
        </div>
      </header>

      {today && contacts.length > 0 ? (
        <div className="rise mt-5">
          <YearMeridian contacts={contacts} today={today} />
        </div>
      ) : null}

      {/* The one thing you opened the app to find out. */}
      {todaysPeople.length > 0 ? (
        <section className="rise rise-1 mt-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Today</p>
          <p className="mt-2 font-display text-[34px] leading-[1.1] tracking-tight text-ink">
            {todaysPeople.map((c) => c.name).join(", ")}
          </p>
          <p className="mt-1.5 text-sm text-muted">
            {todaysPeople
              .map((c) => (c.turningAge != null ? `turns ${c.turningAge}` : "age unknown"))
              .join(" · ")}
          </p>
        </section>
      ) : next ? (
        <section className="rise rise-1 mt-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
            {countdown(next.daysUntil)}
          </p>
          <p className="mt-2 font-display text-[34px] leading-[1.1] tracking-tight text-ink">
            {next.name}
          </p>
          <p className="mt-1.5 text-sm text-muted">
            {monthDay(next)}
            {next.turningAge != null ? ` · turns ${next.turningAge}` : ""}
          </p>
        </section>
      ) : null}

      <div className="rise rise-2 sticky top-0 z-20 -mx-5 mt-7 bg-ground px-5 pb-3 pt-2 sm:-mx-7 sm:px-7">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-y-1/2 text-faint"
          />
          <input
            className={inputClass}
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
          />
        </div>
      </div>

      {error ? (
        <div className="mb-4">
          <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
        </div>
      ) : null}

      <main className="pb-8">
        {loading ? (
          <p className="py-16 text-center text-sm text-faint">Loading…</p>
        ) : contacts.length === 0 ? (
          <EmptyState icon="calendar" title="No birthdays yet">
            Add someone, or import a CSV export to fill the year in one go.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="Nothing matches">
            No one here matches “{query}”.
          </EmptyState>
        ) : (
          <div>
            {months.map(({ key, month, year, contacts: list }) => (
              <section key={key} className="mt-7 first:mt-2">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    {MONTHS[month - 1]}
                    {today && year !== today.year ? (
                      <span className="ml-1.5 font-normal tracking-normal text-faint">{year}</span>
                    ) : null}
                  </h2>
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-[11px] tabular-nums text-faint">{list.length}</span>
                </div>
                <ul className="mt-1 divide-y divide-line">
                  {list.map((contact) => (
                    <ContactRow
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

      {/* Fixed, not sticky: inside an installed web app a sticky bar can fail to
          resolve its containing block and strand itself mid-screen. No blur —
          a blurred fixed bar detaches during iOS momentum scrolling. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-5 py-3 sm:px-7">
          <Button variant="accent" icon="plus" onClick={() => { setEditing(null); setDialog("add"); }}>
            Add
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

      {dialog === "import" ? <ImportPanel onClose={() => setDialog(null)} onImported={load} /> : null}
      {dialog === "notifications" ? <NotificationSettings onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
