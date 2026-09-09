import { useState } from "react";
import { Button } from "./ui.jsx";
import { fieldClass } from "./ui.jsx";

/** Shown only when the server is running with a passcode set. Once per device. */
export function Passcode({ onUnlocked }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "That didn't work.");
      onUnlocked();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-ground px-6">
      <form onSubmit={submit} className="w-full max-w-[19rem]">
        <h1 className="font-display text-[30px] leading-none tracking-tight">Birthdays</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Enter the passcode. This device stays signed in.
        </p>
        <input
          className={`${fieldClass} mt-5 text-center tracking-[0.3em]`}
          type="password"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Passcode"
        />
        {error ? <p className="mt-2.5 text-[13px] text-accent">{error}</p> : null}
        <Button type="submit" variant="accent" className="mt-4 w-full" disabled={busy || !value}>
          {busy ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
