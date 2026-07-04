/**
 * Statistics cards component displaying talent pool metrics.
 */
import { Users, Sparkles, TrendingUp, UserCheck } from "lucide-react";

interface Stats {
  total: number;
  potentialCount: number;
  activeCount: number;
  placedWithUsCount: number;
  placedOtherCount: number;
}

interface StatsCardsProps {
  stats: Stats;
}

const cards = [
  {
    key: "total" as const,
    label: "Total",
    icon: Users,
    stagger: "stagger-1",
  },
  {
    key: "potentialCount" as const,
    label: "Potential",
    icon: Sparkles,
    stagger: "stagger-2",
  },
  {
    key: "activeCount" as const,
    label: "Active",
    icon: TrendingUp,
    stagger: "stagger-3",
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = stats[card.key];
        return (
          <div
            key={card.key}
            className={`animate-fade-in ${card.stagger} rounded-xl border border-border bg-card p-4 cursor-default`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {card.label}
              </span>
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </div>
            <p
              className={`text-3xl font-bold tabular-nums tracking-tight animate-count-up ${card.stagger} text-foreground`}
            >
              {value}
            </p>
          </div>
        );
      })}

      {/* Placed — With us / Outside breakdown, same header rhythm as the other cards */}
      <div className="animate-fade-in stagger-4 col-span-2 rounded-xl border border-border bg-card p-4 cursor-default">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Placed
          </span>
          <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>
        <div className="flex items-baseline gap-4">
          <div className="flex items-baseline gap-1.5">
            <p className="text-3xl font-bold tabular-nums tracking-tight animate-count-up stagger-4 text-foreground">
              {stats.placedWithUsCount}
            </p>
            <span className="text-[11px] text-muted-foreground/70">With us</span>
          </div>
          <div className="h-5 w-px bg-border self-center" />
          <div className="flex items-baseline gap-1.5">
            <p className="text-3xl font-bold tabular-nums tracking-tight animate-count-up stagger-4 text-foreground">
              {stats.placedOtherCount}
            </p>
            <span className="text-[11px] text-muted-foreground/70">Outside</span>
          </div>
        </div>
      </div>
    </div>
  );
}
