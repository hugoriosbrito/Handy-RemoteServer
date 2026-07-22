import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { Button } from "../../ui/Button";
import { useSettings } from "../../../hooks/useSettings";
import { commands } from "@/bindings";

type PairingSession = {
  session_id: string;
  code: string;
  expires_at: string;
  qr: {
    version: number;
    session_id: string;
    secret: string;
    server_name: string;
    fingerprint: string;
    expires_at: string;
    endpoints: {
      local: string | null;
      mdns: string | null;
      tailscale: string | null;
    };
  };
};

type RemoteDevice = {
  id: string;
  name: string;
  platform: string | null;
  created_at: string;
  last_seen_at: string | null;
};

type ClaimedEvent = {
  sessionId: string;
  code: string;
  deviceName?: string;
  platform?: string;
};

export const MobileAccessSettings: React.FC = () => {
  const { t } = useTranslation();
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
  const [pairing, setPairing] = useState<PairingSession | null>(null);
  const [pendingClaim, setPendingClaim] = useState<ClaimedEvent | null>(null);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    refreshStatus();
    refreshDevices();
    const unlisten = listen<ClaimedEvent>("remote-pairing-claimed", (event) => {
      setPendingClaim(event.payload);
      toast.message(t("settings.mobileAccess.pairing.claimedToast"), {
        description: event.payload.deviceName,
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshStatus, refreshDevices, t]);

  const handleCreatePairing = async () => {
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
  };

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

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.mobileAccess.title")}>
        <ToggleSwitch
          checked={enabled}
          onChange={(v) => updateSetting("remote_server_enabled", v)}
          isUpdating={isUpdating("remote_server_enabled")}
          label={t("settings.mobileAccess.enable.label")}
          description={t("settings.mobileAccess.enable.description")}
          descriptionMode="tooltip"
          grouped={true}
        />
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

      <SettingsGroup title={t("settings.mobileAccess.status.title")}>
        <div className="px-4 py-3 text-sm space-y-1">
          <p>
            {t("settings.mobileAccess.status.running")}:{" "}
            <span className={running ? "text-green-600" : "text-mid-gray"}>
              {running
                ? t("settings.mobileAccess.status.online")
                : t("settings.mobileAccess.status.offline")}
            </span>
          </p>
          <p className="text-mid-gray">
            {t("settings.mobileAccess.status.port")}: {port}
          </p>
          {serverName && (
            <p className="text-mid-gray">
              {t("settings.mobileAccess.status.name")}: {serverName}
            </p>
          )}
          {fingerprint && (
            <p className="text-xs text-mid-gray break-all font-mono">
              {fingerprint}
            </p>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.mobileAccess.pairing.title")}>
        <div className="px-4 py-3 space-y-3">
          <p className="text-sm text-mid-gray">
            {t("settings.mobileAccess.pairing.description")}
          </p>
          <Button
            variant="primary"
            disabled={!enabled || !running || busy}
            onClick={handleCreatePairing}
          >
            {t("settings.mobileAccess.pairing.connect")}
          </Button>
          {pairing && (
            <div className="rounded-lg border border-mid-gray/20 bg-logo-primary/10 p-4 space-y-2">
              <p className="text-sm font-medium">
                {t("settings.mobileAccess.pairing.code")}
              </p>
              <p className="text-3xl font-bold tracking-widest">
                {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
              </p>
              <p className="text-xs text-mid-gray break-all">
                {JSON.stringify(pairing.qr)}
              </p>
            </div>
          )}
          {pendingClaim && (
            <div className="rounded-lg border border-mid-gray/20 p-4 space-y-3">
              <p className="text-sm font-medium">
                {t("settings.mobileAccess.pairing.pending", {
                  device: pendingClaim.deviceName || "Mobile",
                })}
              </p>
              <p className="text-2xl font-bold tracking-widest">
                {pendingClaim.code.slice(0, 3)} {pendingClaim.code.slice(3)}
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

      <SettingsGroup title={t("settings.mobileAccess.devices.title")}>
        <div className="px-4 py-3 space-y-2">
          {devices.length === 0 ? (
            <p className="text-sm text-mid-gray">
              {t("settings.mobileAccess.devices.empty")}
            </p>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-mid-gray/20 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{device.name}</p>
                  <p className="text-xs text-mid-gray">
                    {device.platform || "unknown"} · {device.id}
                  </p>
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
    </div>
  );
};
