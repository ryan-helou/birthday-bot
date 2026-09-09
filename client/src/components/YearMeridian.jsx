import { useMemo } from "react";

/**
 * The year as one measured line: a tick for every birthday at its true position
 * in the 365 days, and a marker for today.
 *
 * It encodes something real — where the people you track actually fall, and how
 * far the next one is — rather than decorating the header. Clusters and empty
 * stretches are the point.
 */
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const dayOfYear = (month, day) => MONTH_STARTS[month - 1] + day - 1;

export function YearMeridian({ contacts, today }) {
  const marks = useMemo(() => {
    const counts = new Map();
    for (const contact of contacts) {
      const d = dayOfYear(contact.birthMonth, contact.birthDay);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].map(([d, n]) => ({ d, n }));
  }, [contacts]);

  const todayDay = dayOfYear(today.month, today.day);
  const pct = (d) => (d / 364) * 100;

  return (
    <figure className="m-0 select-none" aria-hidden="true">
      <div className="relative h-9">
        {/* the year */}
        <div className="absolute inset-x-0 top-4 h-px bg-line" />

        {marks.map(({ d, n }) => {
          const isToday = d === todayDay;
          return (
            <span
              key={d}
              className={`absolute w-px rounded-full ${
                isToday ? "bg-accent" : "bg-line-firm"
              }`}
              style={{
                left: `${pct(d)}%`,
                top: isToday ? 6 : 10 - Math.min(n - 1, 2),
                height: isToday ? 18 : 9 + Math.min(n - 1, 2) * 3,
              }}
            />
          );
        })}

        {/* today */}
        <span
          className="absolute size-[7px] -translate-x-1/2 rounded-full bg-accent ring-4 ring-ground"
          style={{ left: `${pct(todayDay)}%`, top: 13 }}
        />
      </div>

      <div className="relative mt-0.5 h-3">
        {LABELS.map((label, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 text-[9px] font-medium uppercase tracking-[0.12em] text-faint"
            style={{ left: `${pct(MONTH_STARTS[i] + 15)}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </figure>
  );
}
