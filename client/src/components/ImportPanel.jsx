import { useRef, useState } from "react";
import { api } from "../lib/api.js";
import { Banner, Button, Modal } from "./ui.jsx";
import { Icon } from "./Icon.jsx";
import { monthDay } from "../lib/format.js";

/**
 * Bulk import. Always previews first (a dry run on the server) so nothing is
 * written until the user has seen exactly what will land and what was skipped.
 */
export function ImportPanel({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function choose(nextFile) {
    if (!nextFile) return;
    setFile(nextFile);
    setPreview(null);
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      setPreview(await api.importFile(nextFile, { dryRun: true }));
    } catch (previewError) {
      setError(previewError.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    setBusy(true);
    setError(null);
    try {
      const imported = await api.importFile(file, { dryRun: false });
      setResult(imported);
      await onImported();
    } catch (importError) {
      setError(importError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Bulk import" onClose={onClose}>
      {!result ? (
        <>
          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              choose(event.dataTransfer.files?.[0]);
            }}
            className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
              dragging ? "border-accent bg-accent-soft" : "border-line"
            }`}
          >
            <Icon name="upload" className="mx-auto size-7 text-muted" />
            <p className="mt-3 text-sm font-medium text-ink">
              {file ? file.name : "Drop a CSV or JSON file"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
              Any export with a name column and a birthday column works. Month/day with
              no year is fine — that's all Snapchat's birthday list shows.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.json,.txt,text/csv,application/json"
              className="hidden"
              onChange={(event) => choose(event.target.files?.[0])}
            />
            <Button type="button" variant="outline" className="mt-4" onClick={() => inputRef.current?.click()}>
              Choose a file
            </Button>
          </div>

          {error ? <div className="mt-4"><Banner tone="error">{error}</Banner></div> : null}

          {preview ? (
            <div className="mt-4 space-y-3">
              <Banner tone={preview.willImport > 0 ? "success" : "info"}>
                Read {preview.totalRecords} record{preview.totalRecords === 1 ? "" : "s"} —{" "}
                <strong>{preview.willImport} ready to import</strong>
                {preview.skipped.length > 0 ? `, ${preview.skipped.length} skipped.` : "."}
              </Banner>

              {preview.preview.length > 0 ? (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-line">
                  <ul className="divide-y divide-line text-sm">
                    {preview.preview.map((contact, index) => (
                      <li key={`${contact.name}-${index}`} className="flex items-center justify-between gap-3 px-3.5 py-2">
                        <span className="truncate font-medium text-ink">{contact.name}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {monthDay(contact)}
                          {contact.yearKnown ? ` ${contact.birthdate.slice(0, 4)}` : " (no year)"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.skipped.length > 0 ? (
                <details className="rounded-xl border border-line px-3.5 py-2.5 text-sm">
                  <summary className="cursor-pointer font-medium text-ink">
                    {preview.skipped.length} skipped
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {preview.skipped.slice(0, 50).map((item, index) => (
                      <li key={index}>
                        <span className="text-ink">{item.name ?? `Row ${item.index + 2}`}</span> — {item.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  type="button"
                  variant="accent"
                  onClick={confirmImport}
                  disabled={busy || preview.willImport === 0}
                >
                  {busy ? "Importing…" : `Import ${preview.willImport}`}
                </Button>
              </div>
            </div>
          ) : null}

          {busy && !preview ? <p className="mt-4 text-sm text-muted">Reading file…</p> : null}
        </>
      ) : (
        <div className="space-y-4">
          <Banner tone="success">
            Added {result.created}, updated {result.updated}, already had {result.unchanged}.
          </Banner>
          <div className="flex justify-end">
            <Button variant="accent" onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
