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
import { SettingsSheet } from "./components/SettingsSheet.jsx";
import { Passcode } from "./components/Passcode.jsx";

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
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listContacts();
      setContacts(data.contacts);
      setToday(data.today);
      setError(null);
    } catch (loadError) {
      // 401 only happens when the server is running with APP_PASSCODE set.
      if (/locked/i.test(loadError.message)) setLocked(true);
      else setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* A Home Screen app is resumed far more often than it is launched, and it can
     sit backgrounded across a midnight — so "in 2 days" would quietly be wrong.
     Refresh whenever it comes back to the foreground. */
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  /* A birthday notification links to ?contact=<id>. Opening it should land on
     that person, not on the list — the payload has always promised this. */
  useEffect(() => {
    if (loading || contacts.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get("contact");
    if (!wanted) return;
    const match = contacts.find((c) => c.id === wanted);
    if (match) { setEditing(match); setDialog("edit"); }
    window.history.replaceState({}, "", window.location.pathname);
  }, [loading, contacts]);
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

  /* Anyone whose day fell in the last week. They are ~360 days "away" and would
     otherwise sit at the very bottom of the year, which is exactly where you
     would not look to check whether you missed someone. */
  const justPassed = useMemo(
    () => contacts.filter((c) => c.daysUntil >= 358).sort((a, b) => b.daysUntil - a.daysUntil),
    [contacts],
  );

  async function handleDelete(contact) {
    if (!window.confirm(`Remove ${contact.name}?`)) return;
    await api.deleteContact(contact.id);
    await load();
  }

  if (locked) {
    return <Passcode onUnlocked={() => { setLocked(false); setLoading(true); load(); }} />;
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-ground">
      {/* Only this middle region scrolls. The bar below is a normal-flow sibling,
          so it cannot resolve against a viewport that disagrees with the screen —
          the failure mode `position: fixed` has in an installed iOS web app. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto w-full max-w-xl px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-7">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-none tracking-tight">Birthdays</h1>
          <p className="mt-1.5 text-[13px] tabular-nums text-faint">
            {contacts.length} {contacts.length === 1 ? "person" : "people"}
          </p>
        </div>

        {/* Both actions live up here now. No bottom bar means the whole class of
            installed-iOS bottom-bar bugs simply cannot occur. */}
        <div className="-mr-2 flex items-center gap-0.5">
          <button
            onClick={() => setDialog("settings")}
            className="relative grid size-11 place-items-center rounded-full text-muted transition active:bg-line/60 sm:size-10 sm:hover:text-ink"
            aria-label="Settings"
          >
            <Icon name={pushOn ? "bell" : "bellOff"} className="size-[19px]" />
            {pushOn ? (
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" />
            ) : null}
          </button>
          <button
            onClick={() => { setEditing(null); setDialog("add"); }}
            className="grid size-11 place-items-center rounded-full bg-accent text-on-accent transition active:scale-95 sm:size-10"
            aria-label="Add a birthday"
          >
            <Icon name="plus" className="size-[21px]" />
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

      <main>
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
            {!query && justPassed.length > 0 ? (
              <section className="mt-2">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Just passed
                  </h2>
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-[11px] tabular-nums text-faint">{justPassed.length}</span>
                </div>
                <ul className="mt-1 divide-y divide-line">
                  {justPassed.map((contact) => (
                    <ContactRow
                      key={`passed-${contact.id}`}
                      contact={contact}
                      passed={365 - contact.daysUntil}
                      onEdit={(t) => { setEditing(t); setDialog("edit"); }}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {months.map(({ key, month, year, contacts: list }) => (
              <section key={key} className={justPassed.length && !query ? "mt-7" : "mt-7 first:mt-2"}>
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

        </div>
      </div>

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
      {dialog === "settings" ? (
        <SettingsSheet onClose={() => setDialog(null)} onImport={() => setDialog("import")} />
      ) : null}
    </div>
  );
}
