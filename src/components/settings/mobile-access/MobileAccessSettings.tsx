import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import {
  MonitorSmartphone,
  RefreshCw,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { Button } from "../../ui/Button";
import { useSettings } from "../../../hooks/useSettings";
import {
  commands,
  type DeviceInfo,
  type PairingSessionResponse,
} from "@/bindings";

type ClaimedEvent = {
  sessionId: string;
  code: string;
  deviceName?: string;
  platform?: string;
};

function formatCode(code: string): string {
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
  }
  return code;
}

function formatRelativeTime(epochSecs: string | null, locale: string): string {
  if (!epochSecs) return "—";
  const ts = Number(epochSecs) * 1000;
  if (!Number.isFinite(ts)) return "—";
  const diffSec = Math.round((Date.now() - ts) / 1000);
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (Math.abs(diffSec) < 60) return rtf.format(-diffSec, "second");
    if (Math.abs(diffSec) < 3600)
      return rtf.format(-Math.round(diffSec / 60), "minute");
    if (Math.abs(diffSec) < 86400)
      return rtf.format(-Math.round(diffSec / 3600), "hour");
    return rtf.format(-Math.round(diffSec / 86400), "day");
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export const MobileAccessSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const enabled = getSetting("remote_server_enabled") ?? false;
  const port = getSetting("remote_server_port") ?? 8765;
  const localNetwork = getSetting("remote_local_network_enabled") ?? true;
  const remoteAccess = getSetting("remote_access_enabled") ?? false;
  const approvalRequired =
    getSetting("remote_device_approval_required") ?? true;

  const [running, setRunning] = useState(false);
  const [serverName, setServerName] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingSessionResponse | null>(null);
  const [pendingClaim, setPendingClaim] = useState<ClaimedEvent | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await commands.getRemoteServerStatus();
      if (status.status === "ok") {
        setRunning(status.data.running);
        setServerName(status.data.server_name);
        setFingerprint(status.data.fingerprint);
      }
    } catch (e) {
      console.warn("Failed to refresh remote status", e);
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const result = await commands.listRemoteDevices();
      if (result.status === "ok") {
        setDevices(result.data);
      }
    } catch {
      // Server may be offline
    }
  }, []);

  const createPairing = useCallback(async () => {
    setBusy(true);
    try {
      const result = await commands.createRemotePairingSession();
      if (result.status === "ok") {
        setPairing(result.data);
        setPendingClaim(null);
      } else {
        toast.error(String(result.error));
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshDevices();
    const unlisten = listen<ClaimedEvent>("remote-pairing-claimed", (event) => {
      setPendingClaim(event.payload);
      toast.message(t("settings.mobileAccess.pairing.claimedToast"), {
        description: event.payload.deviceName,
      });
    });
    const interval = window.setInterval(() => {
      refreshStatus();
      refreshDevices();
    }, 8000);
    return () => {
      unlisten.then((fn) => fn());
      window.clearInterval(interval);
    };
  }, [refreshStatus, refreshDevices, t]);

  // Auto-create / refresh QR when the remote server becomes available.
  useEffect(() => {
    if (enabled && running && !pairing && !busy) {
      void createPairing();
    }
    if ((!enabled || !running) && pairing) {
      setPairing(null);
      setPendingClaim(null);
    }
  }, [enabled, running, pairing, busy, createPairing]);

  const qrPayload = useMemo(() => {
    if (!pairing) return "";
    return JSON.stringify(pairing.qr);
  }, [pairing]);

  const endpointHint =
    pairing?.qr.endpoints.local ||
    pairing?.qr.endpoints.mdns ||
    `localhost:${port}`;

  const handleApprove = async (approve: boolean) => {
    if (!pendingClaim) return;
    setBusy(true);
    try {
      const result = await commands.approveRemotePairingSession(
        pendingClaim.sessionId,
        approve,
      );
      if (result.status === "ok") {
        toast.success(
          approve
            ? t("settings.mobileAccess.pairing.approved")
            : t("settings.mobileAccess.pairing.rejected"),
        );
        setPendingClaim(null);
        setPairing(null);
        await refreshDevices();
        if (approve && enabled && running) {
          await createPairing();
        }
      } else {
        toast.error(String(result.error));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (deviceId: string) => {
    const result = await commands.revokeRemoteDevice(deviceId);
    if (result.status === "ok") {
      toast.success(t("settings.mobileAccess.devices.revoked"));
      await refreshDevices();
    } else {
      toast.error(String(result.error));
    }
  };

  const handleEnable = async (value: boolean) => {
    await updateSetting("remote_server_enabled", value);
    // Give the backend a moment to start/stop before refreshing UI state.
    window.setTimeout(() => {
      void refreshStatus();
    }, 250);
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <div className="px-1 space-y-1">
        <h1 className="text-xl font-semibold text-text">
          {t("settings.mobileAccess.sessionTitle")}
        </h1>
        <p className="text-sm text-mid-gray">
          {t("settings.mobileAccess.sessionSubtitle")}
        </p>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          running
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-mid-gray/20 bg-mid-gray/5"
        }`}
      >
        {running ? (
          <Wifi className="text-emerald-600 shrink-0" size={20} />
        ) : (
          <WifiOff className="text-mid-gray shrink-0" size={20} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {running
              ? t("settings.mobileAccess.status.online")
              : t("settings.mobileAccess.status.offline")}
            {serverName ? ` · ${serverName}` : ""}
          </p>
          <p className="text-xs text-mid-gray truncate">
            {t("settings.mobileAccess.status.port")}: {port}
            {endpointHint ? ` · ${endpointHint}` : ""}
          </p>
        </div>
        <label
          className={`inline-flex items-center gap-2 shrink-0 ${
            isUpdating("remote_server_enabled")
              ? "opacity-60 cursor-not-allowed"
              : "cursor-pointer"
          }`}
          title={t("settings.mobileAccess.enable.description")}
        >
          <span className="text-xs font-medium text-mid-gray">
            {t("settings.mobileAccess.enable.shortLabel")}
          </span>
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            disabled={isUpdating("remote_server_enabled")}
            onChange={(e) => void handleEnable(e.target.checked)}
          />
          <div className="relative w-11 h-6 bg-mid-gray/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-logo-primary rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-background-ui" />
        </label>
      </div>

      <SettingsGroup title={t("settings.mobileAccess.pairing.title")}>
        <div className="px-4 py-5 space-y-5">
          <p className="text-sm text-mid-gray">
            {t("settings.mobileAccess.pairing.description")}
          </p>

          <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
            <div className="rounded-2xl border border-mid-gray/20 bg-white p-4 shadow-sm">
              {pairing && running ? (
                <QRCodeSVG
                  value={qrPayload}
                  size={200}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0f0f0f"
                  includeMargin={false}
                />
              ) : (
                <div className="w-[200px] h-[200px] flex flex-col items-center justify-center gap-2 text-mid-gray bg-mid-gray/5 rounded-lg">
                  <MonitorSmartphone size={36} />
                  <p className="text-xs text-center px-3">
                    {enabled
                      ? t("settings.mobileAccess.pairing.waitingServer")
                      : t("settings.mobileAccess.pairing.enableFirst")}
                  </p>
                </div>
              )}
            </div>

            <div className="flex-1 w-full space-y-4">
              <div className="rounded-xl bg-logo-primary/15 border border-logo-primary/30 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-mid-gray mb-1">
                  {t("settings.mobileAccess.pairing.code")}
                </p>
                <p className="text-3xl font-bold tracking-[0.2em] text-text">
                  {pairing && running ? formatCode(pairing.code) : "••• •••"}
                </p>
              </div>

              {fingerprint && (
                <p className="text-[11px] font-mono text-mid-gray break-all">
                  {fingerprint}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={!enabled || !running || busy}
                  onClick={() => void createPairing()}
                >
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw size={14} />
                    {t("settings.mobileAccess.pairing.refreshQr")}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          {pendingClaim && (
            <div className="rounded-xl border border-background-ui/40 bg-logo-primary/10 p-4 space-y-3">
              <p className="text-sm font-medium">
                {t("settings.mobileAccess.pairing.pending", {
                  device: pendingClaim.deviceName || "Mobile",
                })}
              </p>
              <p className="text-2xl font-bold tracking-widest">
                {formatCode(pendingClaim.code)}
              </p>
              <p className="text-xs text-mid-gray">
                {t("settings.mobileAccess.pairing.confirmHint")}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => handleApprove(true)}
                >
                  {t("settings.mobileAccess.pairing.authorize")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => handleApprove(false)}
                >
                  {t("settings.mobileAccess.pairing.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup
        title={t("settings.mobileAccess.devices.title")}
        description={t("settings.mobileAccess.devices.subtitle")}
      >
        <div className="px-4 py-3 space-y-2">
          {devices.length === 0 ? (
            <div className="flex items-start gap-3 py-2 text-sm text-mid-gray">
              <Smartphone size={18} className="mt-0.5 shrink-0" />
              <p>{t("settings.mobileAccess.devices.empty")}</p>
            </div>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-mid-gray/20 px-3 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-lg bg-logo-primary/25 flex items-center justify-center shrink-0">
                    <Smartphone size={18} className="text-text" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {device.name}
                    </p>
                    <p className="text-xs text-mid-gray truncate">
                      {device.platform ||
                        t("settings.mobileAccess.devices.unknownPlatform")}{" "}
                      ·{" "}
                      {t("settings.mobileAccess.devices.lastSeen", {
                        time: formatRelativeTime(
                          device.lastSeenAt,
                          i18n.language,
                        ),
                      })}
                    </p>
                  </div>
                </div>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={() => handleRevoke(device.id)}
                >
                  {t("settings.mobileAccess.devices.revoke")}
                </Button>
              </div>
            ))
          )}
        </div>
      </SettingsGroup>

      <div className="px-1">
        <button
          type="button"
          className="text-sm text-mid-gray hover:text-text transition-colors cursor-pointer"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced
            ? t("settings.mobileAccess.advanced.hide")
            : t("settings.mobileAccess.advanced.show")}
        </button>
      </div>

      {showAdvanced && (
        <SettingsGroup title={t("settings.mobileAccess.advanced.title")}>
          <ToggleSwitch
            checked={localNetwork}
            onChange={(v) => updateSetting("remote_local_network_enabled", v)}
            isUpdating={isUpdating("remote_local_network_enabled")}
            disabled={!enabled}
            label={t("settings.mobileAccess.localNetwork.label")}
            description={t("settings.mobileAccess.localNetwork.description")}
            descriptionMode="tooltip"
            grouped={true}
          />
          <ToggleSwitch
            checked={remoteAccess}
            onChange={(v) => updateSetting("remote_access_enabled", v)}
            isUpdating={isUpdating("remote_access_enabled")}
            disabled={!enabled}
            label={t("settings.mobileAccess.remoteAccess.label")}
            description={t("settings.mobileAccess.remoteAccess.description")}
            descriptionMode="tooltip"
            grouped={true}
          />
          <ToggleSwitch
            checked={approvalRequired}
            onChange={(v) =>
              updateSetting("remote_device_approval_required", v)
            }
            isUpdating={isUpdating("remote_device_approval_required")}
            disabled={!enabled}
            label={t("settings.mobileAccess.approval.label")}
            description={t("settings.mobileAccess.approval.description")}
            descriptionMode="tooltip"
            grouped={true}
          />
        </SettingsGroup>
      )}
    </div>
  );
};
