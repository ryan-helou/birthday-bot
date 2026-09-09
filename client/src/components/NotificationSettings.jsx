import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { disablePush, enablePush, getExistingSubscription, iosNeedsInstall, pushSupported } from "../lib/push.js";
import { Banner, Button, Modal } from "./ui.jsx";
import { Icon } from "./Icon.jsx";

export function NotificationSettings({ onClose }) {
  const [subscribed, setSubscribed] = useState(false);
  const [devices, setDevices] = useState([]);
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const supported = pushSupported();
  const needsInstall = !supported && iosNeedsInstall();

  async function refresh() {
    // Settled, not all: one failing lookup must not blank the whole panel.
    const [subscription, list, info] = await Promise.allSettled([
      getExistingSubscription(),
      api.listSubscriptions(),
      api.health(),
    ]);
    setSubscribed(subscription.status === "fulfilled" && Boolean(subscription.value));
    setDevices(list.status === "fulfilled" ? (list.value.subscriptions ?? []) : []);
    setHealth(info.status === "fulfilled" ? info.value : null);
  }

  useEffect(() => { refresh(); }, []);

  async function toggle() {
    setBusy(true);
    setStatus(null);
    try {
      if (subscribed) {
        await disablePush();
        setStatus({ tone: "info", message: "This device will no longer get reminders." });
      } else {
        await enablePush();
        setStatus({ tone: "success", message: "This device is registered. Reminders arrive at 8:00 AM." });
      }
      await refresh();
    } catch (error) {
      setStatus({ tone: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.sendTest();
      setStatus({
        tone: result.sent > 0 ? "success" : "error",
        message:
          result.sent > 0
            ? `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}. It should appear now.`
            : "No device accepted the notification. Enable them on this device first.",
      });
      await refresh();
    } catch (error) {
      setStatus({ tone: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Notifications" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-line bg-paper px-4 py-3.5">
          <Icon name={subscribed ? "bell" : "bellOff"} className={`mt-0.5 size-5 ${subscribed ? "text-accent" : "text-muted"}`} />
          <div className="flex-1">
            <p className="font-medium text-ink">
              {subscribed ? "Reminders are on for this device" : "Reminders are off for this device"}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {health
                ? `Sent at ${String(health.notifyHour).padStart(2, "0")}:00 ${health.timeZone.replace("_", " ")}, on the day.`
                : "One notification per day, on the morning of the birthday."}
            </p>
          </div>
        </div>

        {needsInstall ? (
          <Banner tone="info">
            On iPhone and iPad, push notifications only work once the app is added to the
            Home Screen. Tap Share, then <strong>Add to Home Screen</strong>, and open it
            from there.
          </Banner>
        ) : null}

        {!supported && !needsInstall ? (
          <Banner tone="error">This browser doesn't support Web Push.</Banner>
        ) : null}

        {health && !health.pushConfigured ? (
          <Banner tone="error">
            The server has no VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY,
            then restart it.
          </Banner>
        ) : null}

        {status ? <Banner tone={status.tone}>{status.message}</Banner> : null}

        <div className="flex flex-wrap gap-2">
          <Button variant={subscribed ? "outline" : "accent"} icon={subscribed ? "bellOff" : "bell"} onClick={toggle} disabled={busy || !supported}>
            {subscribed ? "Turn off on this device" : "Enable notifications"}
          </Button>
          <Button variant="outline" onClick={sendTest} disabled={busy || devices.length === 0}>
            Send a test
          </Button>
        </div>

        {devices.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">
              Registered devices ({devices.length})
            </p>
            <ul className="divide-y divide-line rounded-xl border border-line text-sm">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Icon name="device" className="size-4 shrink-0 text-muted" />
                  <span className="flex-1 truncate text-ink">{device.label ?? "Unknown device"}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {new Date(device.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
