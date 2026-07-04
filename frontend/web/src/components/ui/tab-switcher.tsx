/**
 * Shared large tab-switcher used by AuditLog and HelpCenter — two equal-weight
 * top-level tabs, each with an icon, label, and one-line description.
 */
export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon: React.ReactNode;
  description: string;
}

interface TabSwitcherProps<T extends string> {
  tabs: TabDef<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
}

export function TabSwitcher<T extends string>({
  tabs,
  activeTab,
  onChange,
}: TabSwitcherProps<T>) {
  return (
    <div className="flex gap-3 mb-10 animate-fade-in stagger-1">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex-1 flex flex-col items-start gap-1 px-5 py-4 rounded-2xl border text-left transition-colors duration-200 ${
              isActive
                ? "bg-accent border-transparent"
                : "bg-card border-border hover:bg-secondary"
            }`}
          >
            {isActive && (
              <span className="absolute inset-x-0 top-0 h-0.5 bg-primary rounded-t-2xl" />
            )}
            <div
              className={`flex items-center gap-2 font-semibold text-sm transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </div>
            <span className="text-xs text-muted-foreground/70">
              {tab.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
