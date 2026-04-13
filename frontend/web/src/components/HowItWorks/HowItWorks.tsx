import { useState } from "react";
import { BookOpen, Server } from "lucide-react";
import { UserGuide } from "@/components/UserGuide";
import { TechReference } from "@/components/TechReference";

type Tab = "user-guide" | "tech-reference";

const TABS: {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    id: "user-guide",
    label: "User Guide",
    icon: <BookOpen className="w-4 h-4" />,
    description: "For recruiters & day-to-day users",
  },
  {
    id: "tech-reference",
    label: "Technical Reference",
    icon: <Server className="w-4 h-4" />,
    description: "For developers & architects",
  },
];

export function HowItWorks() {
  const [activeTab, setActiveTab] = useState<Tab>("user-guide");

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="mb-10 animate-fade-in">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">
            Documentation
          </p>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            <span className="shimmer-text">Help Center</span>
          </h1>
          <p className="text-base text-foreground/50">
            Select a guide based on your role.
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
                    ? "bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border-indigo-500/30 shadow-lg shadow-indigo-500/10"
                    : "bg-white/50 dark:bg-white/5 border-black/[0.07] dark:border-white/[0.07] hover:bg-indigo-500/5 hover:border-indigo-500/20"
                }`}
              >
                {/* Active top bar */}
                {isActive && (
                  <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-t-2xl" />
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

        {/* Tab Content — key forces remount for re-animation */}
        <div key={activeTab} className="animate-fade-in">
          {activeTab === "user-guide" ? <UserGuide /> : <TechReference />}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-black/[0.07] dark:border-white/[0.07] text-center">
          <p className="text-foreground/30 text-sm">
            Questions or feedback? Reach out to the development team.
          </p>
        </div>
      </div>
    </div>
  );
}
