import { useState, useEffect, useRef } from "react";
import { BookOpen, Server } from "lucide-react";
import { UserGuide } from "./UserGuide/UserGuide";
import { USER_NAV } from "./UserGuide/userNav";
import { TechReference } from "./TechReference/TechReference";
import { TECH_NAV } from "./TechReference/techNav";
import { TabSwitcher } from "@/components/ui/tab-switcher";

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
          <h1 className="font-display text-3xl text-foreground mb-2">
            Help Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Select a guide based on your role.
          </p>
        </div>

        {/* Tab Switcher */}
        <TabSwitcher tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        {/* Sidebar + Content */}
        <div className="flex gap-8">
          {/* Left Sidebar TOC — floats alongside content */}
          <nav className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-24 rounded-2xl bg-card border border-border p-4 animate-fade-in">
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground/30 mb-4 px-2">
                On this page
              </p>
              <div className="relative">
                {/* Vertical track line */}
                <div className="absolute left-0 top-0 bottom-0 w-px bg-border rounded-full" />
                <ul className="space-y-1 pl-3.5">
                  {navItems.map((s) => {
                    const isActive = activeSection === s.id;
                    return (
                      <li key={s.id} className="relative">
                        {/* Active indicator dot */}
                        {isActive && (
                          <span className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary -translate-x-[2px]" />
                        )}
                        <a
                          href={`#${s.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            document
                              .getElementById(s.id)
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                          className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                            isActive
                              ? "text-primary bg-accent"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
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
        <div className="mt-16 pt-8 border-t border-border text-center">
          <p className="text-foreground/30 text-sm">
            Questions or feedback? Reach out to the development team.
          </p>
        </div>
      </div>
    </div>
  );
}
