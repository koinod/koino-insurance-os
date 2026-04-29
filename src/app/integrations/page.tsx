"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { X, CheckCircle2, Circle, ChevronRight, Zap } from "lucide-react";

type Integration = {
  id: string;
  name: string;
  description: string;
  color: string;
  initials: string;
  connected: boolean;
  highlight?: boolean;
  modalTitle?: string;
  modalBody?: string;
  modalCta?: string;
  steps?: string[];
};

const INTEGRATIONS: Integration[] = [
  {
    id: "commissioniq",
    name: "CommissionIQ",
    description: "Import your existing data",
    color: "bg-amber-500",
    initials: "CIQ",
    connected: false,
    highlight: true,
    modalTitle: "Migrate from CommissionIQ",
    modalBody:
      "Migrate your CommissionIQ data in one click. Import clients, deals, and agent data automatically. Your entire book of business moves over in minutes — no CSV exports, no manual entry.",
    modalCta: "Start Migration",
    steps: [
      "Connect your CommissionIQ account via API key",
      "Preview your data (clients, deals, agents)",
      "One-click import — we handle deduplication",
      "Verify import and go live",
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Deal alerts & rep activity notifications",
    color: "bg-purple-500",
    initials: "SL",
    connected: true,
    steps: [
      "Authorize Koino in your Slack workspace",
      "Choose which channels receive alerts",
      "Configure notification rules per event type",
    ],
  },
  {
    id: "discord",
    name: "Discord",
    description: "Team communication channel",
    color: "bg-indigo-500",
    initials: "DC",
    connected: false,
    steps: [
      "Add the Koino bot to your Discord server",
      "Select target channels for notifications",
      "Map roles to your Koino team members",
    ],
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect to 5,000+ apps",
    color: "bg-orange-500",
    initials: "ZP",
    connected: false,
    steps: [
      "Copy your Koino API key from Settings",
      "Create a new Zap in Zapier",
      "Select Koino as the trigger or action app",
    ],
  },
  {
    id: "gsheets",
    name: "Google Sheets",
    description: "Import/export leads & data",
    color: "bg-green-600",
    initials: "GS",
    connected: false,
    steps: [
      "Connect your Google account",
      "Select the sheet containing your lead data",
      "Map columns to Koino fields",
      "Set sync frequency (manual or auto)",
    ],
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "Send SMS from the platform",
    color: "bg-red-500",
    initials: "TW",
    connected: true,
    steps: [
      "Enter your Twilio Account SID and Auth Token",
      "Select or provision a sending number",
      "Test with a sample message",
    ],
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Email sync & outreach",
    color: "bg-rose-500",
    initials: "GM",
    connected: false,
    steps: [
      "Authorize Gmail via Google OAuth",
      "Choose which label to sync with Koino",
      "Enable two-way sync for replies",
    ],
  },
  {
    id: "gcal",
    name: "Google Calendar",
    description: "Appointment booking",
    color: "bg-blue-500",
    initials: "GC",
    connected: false,
    steps: [
      "Connect your Google account",
      "Select calendars to sync",
      "Set your availability windows",
    ],
  },
  {
    id: "webhook",
    name: "Webhook",
    description: "Custom integrations via webhook URL",
    color: "bg-zinc-500",
    initials: "WH",
    connected: false,
    steps: [
      "Generate a webhook endpoint from Settings",
      "Configure your external app to POST events",
      "Map incoming payload fields to Koino data",
    ],
  },
];

function IntegrationModal({
  integration,
  onClose,
}: {
  integration: Integration;
  onClose: () => void;
}) {
  const [started, setStarted] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-bg-elev border border-line rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-line">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl ${integration.color} flex items-center justify-center text-white font-bold text-sm`}
            >
              {integration.initials}
            </div>
            <div>
              <div className="font-bold text-ink">{integration.name}</div>
              <div className="text-xs text-ink-mute">{integration.description}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-dim hover:text-ink transition-colors mt-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {integration.modalBody && (
            <p className="text-sm text-ink-mute leading-relaxed">
              {integration.modalBody}
            </p>
          )}

          {integration.steps && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-ink-dim font-semibold mb-3">
                Setup steps
              </div>
              {integration.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${
                      started && i === 0
                        ? "bg-accent text-bg"
                        : "bg-bg-hover text-ink-dim"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className="text-sm text-ink-mute">{step}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={() => setStarted(true)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              integration.highlight
                ? "bg-accent text-bg hover:bg-amber-400"
                : "bg-accent text-bg hover:bg-amber-400"
            } ${started ? "opacity-60 cursor-not-allowed" : ""}`}
            disabled={started}
          >
            {started ? "In progress…" : (integration.modalCta ?? "Connect")}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-ink-mute border border-line hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function IntegrationTile({
  integration,
  onOpen,
}: {
  integration: Integration;
  onOpen: (i: Integration) => void;
}) {
  return (
    <div
      className={`bg-bg-card rounded-xl border transition-all cursor-pointer group hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5 ${
        integration.highlight
          ? "border-amber-500/60 shadow-amber-500/10 shadow-md"
          : "border-line"
      }`}
      onClick={() => onOpen(integration)}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div
            className={`w-12 h-12 rounded-xl ${integration.color} flex items-center justify-center text-white font-bold text-sm shadow-sm`}
          >
            {integration.initials}
          </div>
          {integration.highlight && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
              <Zap size={9} />
              Recommended
            </span>
          )}
          {!integration.highlight && (
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                integration.connected
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-bg-hover text-ink-dim border border-line"
              }`}
            >
              {integration.connected ? (
                <>
                  <CheckCircle2 size={10} />
                  Connected
                </>
              ) : (
                <>
                  <Circle size={10} />
                  Available
                </>
              )}
            </span>
          )}
        </div>

        <div className="font-semibold text-ink text-sm mb-1">{integration.name}</div>
        <div className="text-xs text-ink-mute leading-snug">{integration.description}</div>
      </div>

      <div
        className={`px-5 py-3 border-t flex items-center justify-between ${
          integration.highlight ? "border-amber-500/20" : "border-line"
        }`}
      >
        <span
          className={`text-xs font-semibold ${
            integration.connected ? "text-green-400" : "text-accent"
          }`}
        >
          {integration.connected ? "Manage" : "Connect"}
        </span>
        <ChevronRight
          size={14}
          className="text-ink-dim group-hover:text-accent transition-colors"
        />
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [active, setActive] = useState<Integration | null>(null);

  const connected = INTEGRATIONS.filter((i) => i.connected);
  const available = INTEGRATIONS.filter((i) => !i.connected);

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle={`${connected.length} connected · ${available.length} available`}
      />

      {active && (
        <IntegrationModal integration={active} onClose={() => setActive(null)} />
      )}

      <div className="p-6 space-y-8 max-w-5xl">
        {/* CommissionIQ highlight — always first */}
        {(() => {
          const ciq = INTEGRATIONS.find((i) => i.id === "commissioniq")!;
          return (
            <div>
              <div className="text-xs uppercase tracking-widest text-ink-dim font-semibold mb-3">
                Migration
              </div>
              <div
                className="bg-gradient-to-r from-amber-500/10 to-bg-card border border-amber-500/40 rounded-xl p-5 flex items-center justify-between gap-6 cursor-pointer hover:border-amber-500/70 transition-all group"
                onClick={() => setActive(ciq)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-amber-500 flex items-center justify-center text-bg font-bold text-base shadow-lg shadow-amber-500/20">
                    CIQ
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-ink">CommissionIQ</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Zap size={9} />
                        Recommended
                      </span>
                    </div>
                    <div className="text-sm text-ink-mute">
                      Migrate your CommissionIQ data in one click — clients, deals, and agent
                      history imported automatically.
                    </div>
                  </div>
                </div>
                <button className="shrink-0 bg-accent text-bg px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-amber-400 transition-colors whitespace-nowrap">
                  Start Migration →
                </button>
              </div>
            </div>
          );
        })()}

        {/* Connected */}
        {connected.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-widest text-ink-dim font-semibold mb-3">
              Connected ({connected.length})
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {connected.map((i) => (
                <IntegrationTile key={i.id} integration={i} onOpen={setActive} />
              ))}
            </div>
          </div>
        )}

        {/* Available (exclude commissioniq — already shown above) */}
        {(() => {
          const rest = available.filter((i) => i.id !== "commissioniq");
          return rest.length > 0 ? (
            <div>
              <div className="text-xs uppercase tracking-widest text-ink-dim font-semibold mb-3">
                Available ({rest.length})
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {rest.map((i) => (
                  <IntegrationTile key={i.id} integration={i} onOpen={setActive} />
                ))}
              </div>
            </div>
          ) : null;
        })()}
      </div>
    </>
  );
}
