/**
 * Statistics cards component displaying talent pool metrics.
 */
import { Users, Sparkles, TrendingUp, UserCheck } from "lucide-react";

interface Stats {
  total: number;
  potentialCount: number;
  activeCount: number;
  placedCount: number;
}

interface StatsCardsProps {
  stats: Stats;
}

const cards = [
  {
    key: "total" as const,
    label: "Total",
    icon: Users,
    color: "from-slate-500/20 to-slate-600/10",
    border: "border-slate-400/40",
    glow: "group-hover:shadow-slate-500/10",
    iconColor: "text-slate-500 dark:text-slate-300",
    textColor: "text-foreground",
    labelColor: "text-foreground/40",
    stagger: "stagger-1",
  },
  {
    key: "potentialCount" as const,
    label: "Potential",
    icon: Sparkles,
    color: "from-emerald-500/15 to-teal-500/5",
    border: "border-emerald-400/50",
    glow: "group-hover:shadow-emerald-500/20",
    iconColor: "text-emerald-500 dark:text-emerald-400",
    textColor: "text-emerald-600 dark:text-emerald-300",
    labelColor: "text-emerald-600/60 dark:text-emerald-400/60",
    stagger: "stagger-2",
  },
  {
    key: "activeCount" as const,
    label: "Active",
    icon: TrendingUp,
    color: "from-indigo-500/15 to-violet-500/5",
    border: "border-indigo-400/50",
    glow: "group-hover:shadow-indigo-500/20",
    iconColor: "text-indigo-500 dark:text-indigo-400",
    textColor: "text-indigo-600 dark:text-indigo-300",
    labelColor: "text-indigo-600/60 dark:text-indigo-400/60",
    stagger: "stagger-3",
  },
  {
    key: "placedCount" as const,
    label: "Placed",
    icon: UserCheck,
    color: "from-violet-500/15 to-purple-500/5",
    border: "border-violet-400/50",
    glow: "group-hover:shadow-violet-500/20",
    iconColor: "text-violet-500 dark:text-violet-400",
    textColor: "text-violet-600 dark:text-violet-300",
    labelColor: "text-violet-600/60 dark:text-violet-400/60",
    stagger: "stagger-4",
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = stats[card.key];
        return (
          <div
            key={card.key}
            className={`relative animate-fade-in ${card.stagger} overflow-hidden rounded-2xl border bg-linear-to-br ${card.color} ${card.border} p-4 cursor-default`}
          >
            {/* Subtle inner shine */}
            <div className="absolute inset-0 bg-linear-to-br from-white/40 to-transparent dark:from-white/5 pointer-events-none rounded-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`text-[11px] font-semibold uppercase tracking-widest ${card.labelColor}`}
                >
                  {card.label}
                </span>
                <div
                  className={`p-1.5 rounded-lg bg-white/50 dark:bg-black/20 shrink-0 ml-3 ${card.iconColor}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p
                className={`text-3xl font-bold tabular-nums tracking-tight animate-count-up ${card.stagger} ${card.textColor}`}
              >
                {value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
