import { useState, useEffect, useRef } from "react";
import { BookOpen, Server } from "lucide-react";
import { UserGuide } from "./UserGuide/UserGuide";
import { USER_NAV } from "./UserGuide/userNav";
import { TechReference } from "./TechReference/TechReference";
import { TECH_NAV } from "./TechReference/techNav";

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

export function HelpCenter() {
  const [activeTab, setActiveTab] = useState<Tab>("user-guide");
  const [activeSection, setActiveSection] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  const navItems = activeTab === "user-guide" ? USER_NAV : TECH_NAV;

  // Track which section is currently visible
  useEffect(() => {
    observerRef.current?.disconnect();

    const ids = navItems.map((s) => s.id);
    const visibleSections = new Map<string, number>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.set(entry.target.id, entry.intersectionRatio);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }
        // Pick the first visible section in document order
        for (const id of ids) {
          if (visibleSections.has(id)) {
            setActiveSection(id);
            return;
          }
        }
      },
      { rootMargin: "-10% 0px -60% 0px", threshold: [0, 0.25] },
    );

    // Small delay to let tab content mount
    const timer = setTimeout(() => {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) observerRef.current?.observe(el);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      observerRef.current?.disconnect();
    };
  }, [activeTab, navItems]);

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="mb-10 animate-fade-in">
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
                    ? "bg-linear-to-br from-indigo-500/10 to-violet-500/5 border-indigo-500/30 shadow-lg shadow-indigo-500/10"
                    : "bg-white/50 dark:bg-white/5 border-black/7 dark:border-white/7 hover:bg-indigo-500/5 hover:border-indigo-500/20"
                }`}
              >
                {/* Active top bar */}
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

        {/* Sidebar + Content */}
        <div className="flex gap-8">
          {/* Left Sidebar TOC — floats alongside content */}
          <nav className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-24 rounded-2xl bg-white/60 dark:bg-white/4 backdrop-blur-xl border border-black/6 dark:border-white/6 shadow-sm p-4 animate-fade-in">
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground/30 mb-4 px-2">
                On this page
              </p>
              <div className="relative">
                {/* Vertical track line */}
                <div className="absolute left-0 top-0 bottom-0 w-px bg-black/6 dark:bg-white/6 rounded-full" />
                <ul className="space-y-1 pl-3.5">
                  {navItems.map((s) => {
                    const isActive = activeSection === s.id;
                    return (
                      <li key={s.id} className="relative">
                        {/* Active indicator dot */}
                        {isActive && (
                          <span className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50 -translate-x-[2px]" />
                        )}
                        <a
                          href={`#${s.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            document
                              .getElementById(s.id)
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                          className={`block px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/8"
                              : "text-foreground/40 hover:text-foreground/70 hover:bg-black/3 dark:hover:bg-white/3"
                          }`}
                        >
                          {s.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </nav>

          {/* Tab Content — key forces remount for re-animation */}
          <div key={activeTab} className="flex-1 min-w-0 animate-fade-in">
            {activeTab === "user-guide" ? <UserGuide /> : <TechReference />}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-black/7 dark:border-white/7 text-center">
          <p className="text-foreground/30 text-sm">
            Questions or feedback? Reach out to the development team.
          </p>
        </div>
      </div>
    </div>
  );
}
