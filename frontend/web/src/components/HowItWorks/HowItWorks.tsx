import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, Server } from "lucide-react";
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
        <div className="mb-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground/70 transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-medium mb-4">
            Help Center
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-3">
            Help Center
          </h1>
          <p className="text-lg text-foreground/50">
            Select a guide based on your role.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-3 mb-10">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-start gap-1 px-5 py-4 rounded-xl border text-left transition-all duration-200 ${
                  isActive
                    ? "bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/10"
                    : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 hover:border-black/20 dark:hover:border-white/20"
                }`}
              >
                <div
                  className={`flex items-center gap-2 font-semibold text-sm ${
                    isActive
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-foreground/70"
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
        {activeTab === "user-guide" ? <UserGuide /> : <TechReference />}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-black/10 dark:border-white/10 text-center">
          <p className="text-foreground/40 text-sm">
            Questions or feedback? Reach out to the development team.
          </p>
        </div>
      </div>
    </div>
  );
}
