import { useState } from "react";
import { Users, Server } from "lucide-react";
import { RecruiterActivity } from "./RecruiterActivity";
import { SystemActivity } from "./SystemActivity";
import { TabSwitcher } from "@/components/ui/tab-switcher";

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
          <h1 className="font-display text-3xl text-foreground mb-2">
            Activity Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Track recruiter actions and system events across the platform.
          </p>
        </div>

        {/* Tab Switcher */}
        <TabSwitcher tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        {/* Tab Content */}
        <div key={activeTab} className="animate-fade-in">
          {activeTab === "recruiter" ? (
            <RecruiterActivity />
          ) : (
            <SystemActivity />
          )}
        </div>

        {/* Footer note */}
        <div className="mt-16 pt-8 border-t border-border text-center">
          <p className="text-foreground/30 text-sm">
            Recruiter and system activity are loaded from the audit log and
            deployment APIs.
          </p>
        </div>
      </div>
    </div>
  );
}
