const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const monthDay = (contact) => `${MONTHS[contact.birthMonth - 1]} ${contact.birthDay}`;

export function countdown(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 330) return `${Math.round(days / 30)} months`;
  return "next year";
}

export function turningLabel(contact) {
  if (contact.turningAge == null) return "Age unknown";
  return contact.daysUntil === 0 ? `Turning ${contact.turningAge}` : `Turns ${contact.turningAge}`;
}

/** Group the sorted list into the headings the dashboard shows. */
export function groupByHorizon(contacts) {
  const buckets = [
    { key: "today", label: "Today", contacts: [] },
    { key: "week", label: "This week", contacts: [] },
    { key: "month", label: "This month", contacts: [] },
    { key: "later", label: "Later", contacts: [] },
  ];
  for (const contact of contacts) {
    if (contact.daysUntil === 0) buckets[0].contacts.push(contact);
    else if (contact.daysUntil <= 7) buckets[1].contacts.push(contact);
    else if (contact.daysUntil <= 31) buckets[2].contacts.push(contact);
    else buckets[3].contacts.push(contact);
  }
  return buckets.filter((bucket) => bucket.contacts.length > 0);
}

/** "1999-03-14" for a date input; blank when the year was never known. */
export function toDateInputValue(contact) {
  if (!contact) return "";
  return contact.yearKnown ? contact.birthdate : "";
}
