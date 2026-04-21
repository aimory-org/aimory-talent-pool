import { useState } from "react";
import { Users, Server } from "lucide-react";
import { RecruiterActivity } from "./RecruiterActivity";
import { SystemActivity } from "./SystemActivity";

type Tab = "recruiter" | "system";

const TABS: {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    id: "recruiter",
    label: "Recruiter Activity",
    icon: <Users className="w-4 h-4" />,
    description: "Edits, status changes, deletes & tags",
  },
  {
    id: "system",
    label: "System Events",
    icon: <Server className="w-4 h-4" />,
    description: "Deploys, pipeline runs, dedup & reprocessing",
  },
];

export function AuditLog() {
  const [activeTab, setActiveTab] = useState<Tab>("recruiter");

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="mb-10 animate-fade-in">
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            <span className="shimmer-text">Activity Log</span>
          </h1>
          <p className="text-base text-foreground/50">
            Track recruiter actions and system events across the platform.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-3 mb-10 animate-fade-in stagger-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 flex flex-col items-start gap-1 px-5 py-4 rounded-2xl border text-left transition-all duration-300 overflow-hidden ${
                  isActive
                    ? "bg-linear-to-br from-indigo-500/10 to-violet-500/5 border-indigo-500/30 shadow-lg shadow-indigo-500/10"
                    : "bg-white/50 dark:bg-white/5 border-black/7 dark:border-white/7 hover:bg-indigo-500/5 hover:border-indigo-500/20"
                }`}
              >
                {isActive && (
                  <span className="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-indigo-500 to-violet-500 rounded-t-2xl" />
                )}
                <div
                  className={`flex items-center gap-2 font-semibold text-sm transition-colors ${
                    isActive
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-foreground/60"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </div>
                <span className="text-xs text-foreground/40">
                  {tab.description}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div key={activeTab} className="animate-fade-in">
          {activeTab === "recruiter" ? (
            <RecruiterActivity />
          ) : (
            <SystemActivity />
          )}
        </div>

        {/* Footer note */}
        <div className="mt-16 pt-8 border-t border-black/7 dark:border-white/7 text-center">
          <p className="text-foreground/30 text-sm">
            Recruiter and system activity are loaded from the audit log and
            deployment APIs.
          </p>
        </div>
      </div>
    </div>
  );
}
