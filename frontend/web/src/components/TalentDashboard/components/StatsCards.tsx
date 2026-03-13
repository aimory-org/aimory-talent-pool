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

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="group relative bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-all duration-300 cursor-default">
        <div className="absolute inset-0 bg-linear-to-br from-slate-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-medium text-foreground/40 uppercase tracking-wider">
              Total
            </span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">
            {stats.total}
          </p>
        </div>
      </div>

      <div className="group relative bg-emerald-500/10 hover:bg-emerald-500/20 backdrop-blur-lg rounded-xl p-4 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 cursor-default">
        <div className="absolute inset-0 bg-linear-to-br from-emerald-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400/70 uppercase tracking-wider">
              Potential
            </span>
          </div>
          <p className="text-3xl font-bold text-emerald-400 tabular-nums">
            {stats.potentialCount}
          </p>
        </div>
      </div>

      <div className="group relative bg-blue-500/10 hover:bg-blue-500/20 backdrop-blur-lg rounded-xl p-4 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 cursor-default">
        <div className="absolute inset-0 bg-linear-to-br from-blue-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-medium text-blue-400/70 uppercase tracking-wider">
              Active
            </span>
          </div>
          <p className="text-3xl font-bold text-blue-400 tabular-nums">
            {stats.activeCount}
          </p>
        </div>
      </div>

      <div className="group relative bg-green-500/10 hover:bg-green-500/20 backdrop-blur-lg rounded-xl p-4 border border-green-500/20 hover:border-green-500/40 transition-all duration-300 cursor-default">
        <div className="absolute inset-0 bg-linear-to-br from-green-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-4 w-4 text-green-400" />
            <span className="text-xs font-medium text-green-400/70 uppercase tracking-wider">
              Placed
            </span>
          </div>
          <p className="text-3xl font-bold text-green-400 tabular-nums">
            {stats.placedCount}
          </p>
        </div>
      </div>
    </div>
  );
}
