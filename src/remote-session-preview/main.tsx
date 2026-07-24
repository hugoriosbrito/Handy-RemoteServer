import React from "react";
import ReactDOM from "react-dom/client";
import { QRCodeSVG } from "qrcode.react";
import { MonitorSmartphone, RefreshCw, Smartphone, Wifi } from "lucide-react";
import "../App.css";

const mockQr = {
  version: 1,
  session_id: "pair_demo01",
  secret: "demo-secret",
  server_name: "PC do Hugo",
  fingerprint: "sha256:a1b2c3d4e5f67890abcdef",
  expires_at: "9999999999",
  endpoints: {
    local: "192.168.1.50:8765",
    mdns: "handy-remote.local:8765",
    tailscale: null as string | null,
  },
};

const devices = [
  {
    id: "device_01",
    name: "iPhone do Hugo",
    platform: "iOS",
    lastSeen: "há 2 min",
  },
  {
    id: "device_02",
    name: "Pixel 8",
    platform: "Android",
    lastSeen: "há 1 h",
  },
];

function Preview() {
  const qrPayload = JSON.stringify(mockQr);

  return (
    <div className="min-h-screen bg-background text-text p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="px-1 space-y-1">
          <h1 className="text-xl font-semibold">Sessão remota</h1>
          <p className="text-sm text-mid-gray">
            Mostre o QR Code do Handy Remote e gerencie os celulares conectados.
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center gap-3">
          <Wifi className="text-emerald-600 shrink-0" size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Em execução · PC do Hugo</p>
            <p className="text-xs text-mid-gray">
              Porta: 8765 · 192.168.1.50:8765
            </p>
          </div>
          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-medium text-mid-gray">Ativo</span>
            <div className="relative w-11 h-6 rounded-full bg-background-ui">
              <div className="absolute top-[2px] end-[2px] size-5 rounded-full bg-white" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="px-4">
            <h2 className="text-xs font-medium text-mid-gray uppercase tracking-wide">
              Parear celular
            </h2>
          </div>
          <div className="bg-background border border-mid-gray/20 rounded-lg overflow-hidden">
            <div className="px-4 py-5 space-y-5">
              <p className="text-sm text-mid-gray">
                Abra o Handy Remote no celular e escaneie este QR Code. Confirme
                o mesmo código de verificação nos dois aparelhos.
              </p>

              <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                <div className="rounded-2xl border border-mid-gray/20 bg-white p-4 shadow-sm">
                  <QRCodeSVG
                    value={qrPayload}
                    size={200}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#0f0f0f"
                  />
                </div>

                <div className="flex-1 w-full space-y-4">
                  <div className="rounded-xl bg-logo-primary/15 border border-logo-primary/30 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-mid-gray mb-1">
                      Código de verificação
                    </p>
                    <p className="text-3xl font-bold tracking-[0.2em]">
                      482 913
                    </p>
                  </div>
                  <p className="text-[11px] font-mono text-mid-gray break-all">
                    {mockQr.fingerprint}
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-4 py-[5px] text-sm font-medium rounded-lg text-white bg-background-ui"
                  >
                    <RefreshCw size={14} />
                    Atualizar QR
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="px-4">
            <h2 className="text-xs font-medium text-mid-gray uppercase tracking-wide">
              Sessões ativas
            </h2>
            <p className="text-xs text-mid-gray mt-1">
              Celulares autorizados neste computador.
            </p>
          </div>
          <div className="bg-background border border-mid-gray/20 rounded-lg overflow-hidden">
            <div className="px-4 py-3 space-y-2">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-mid-gray/20 px-3 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-10 rounded-lg bg-logo-primary/25 flex items-center justify-center shrink-0">
                      <Smartphone size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {device.name}
                      </p>
                      <p className="text-xs text-mid-gray truncate">
                        {device.platform} · Visto {device.lastSeen}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded-lg text-red-400 hover:bg-red-500/10"
                  >
                    Encerrar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-mid-gray px-1">
          <MonitorSmartphone size={14} />
          Preview da aba Sessão remota — Handy Remote
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
