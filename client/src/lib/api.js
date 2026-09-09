/** Thin fetch wrapper. Same origin in production; Vite proxies /api in dev. */
async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options,
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  listContacts: () => request("/api/contacts"),
  createContact: (contact) => request("/api/contacts", { method: "POST", body: JSON.stringify(contact) }),
  updateContact: (id, contact) =>
    request(`/api/contacts/${id}`, { method: "PUT", body: JSON.stringify(contact) }),
  deleteContact: (id) => request(`/api/contacts/${id}`, { method: "DELETE" }),

  health: () => request("/api/health"),
  runs: () => request("/api/runs"),

  publicKey: () => request("/api/subscriptions/public-key"),
  listSubscriptions: () => request("/api/subscriptions"),
  saveSubscription: (subscription, label) =>
    request("/api/subscriptions", { method: "POST", body: JSON.stringify({ subscription, label }) }),
  removeSubscription: (endpoint) =>
    request("/api/subscriptions/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  sendTest: () => request("/api/subscriptions/test", { method: "POST" }),

  importFile: (file, { dryRun }) => {
    const form = new FormData();
    form.append("file", file);
    return request(`/api/import?dryRun=${dryRun ? "1" : "0"}`, { method: "POST", body: form });
  },
};
