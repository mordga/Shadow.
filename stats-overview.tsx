import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface BotStats {
  threatsBlocked: number;
  activeRaids: number;
  nsfwDetected: number;
  bypassAttempts: number;
  detectionRate: string;
}

export function StatsOverview() {
  const { data: stats, isLoading } = useQuery<BotStats>({
    queryKey: ["/api/stats"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-8 w-8 mb-4" />
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16 mb-4" />
            <Skeleton className="h-4 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      icon: "fas fa-shield-alt",
      label: "Threats Blocked",
      value: stats?.threatsBlocked?.toLocaleString() || "0",
      change: "+12%",
      changeText: "from last week",
      iconColor: "text-accent",
      changeColor: "text-accent",
      testId: "stat-threats-blocked"
    },
    {
      icon: "fas fa-user-ninja",
      label: "Active Raids",
      value: stats?.activeRaids?.toString() || "0",
      badge: stats?.activeRaids && stats.activeRaids > 0 ? "HIGH ALERT" : null,
      iconColor: "text-destructive",
      badgeColor: "bg-destructive text-destructive-foreground",
      testId: "stat-active-raids"
    },
    {
      icon: "fas fa-eye-slash",
      label: "NSFW Detected",
      value: stats?.nsfwDetected?.toString() || "0",
      changeText: "Last 24 hours",
      iconColor: "text-chart-3",
      testId: "stat-nsfw-detected"
    },
    {
      icon: "fas fa-code",
      label: "Bypass Attempts",
      value: stats?.bypassAttempts?.toString() || "0",
      change: stats?.detectionRate || "99.2%",
      changeText: "detection rate",
      iconColor: "text-chart-5",
      changeColor: "text-chart-5",
      testId: "stat-bypass-attempts"
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statCards.map((stat) => (
        <Card key={stat.label} className="p-6" data-testid={stat.testId}>
          <CardContent className="p-0">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <i className={`${stat.icon} ${stat.iconColor} text-2xl`}></i>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-muted-foreground truncate">
                    {stat.label}
                  </dt>
                  <dd className="text-3xl font-bold text-foreground">
                    {stat.value}
                  </dd>
                </dl>
              </div>
            </div>
            <div className="mt-4">
              {stat.badge ? (
                <div className="text-sm">
                  <span className={`${stat.badgeColor} px-2 py-1 rounded text-xs font-medium`}>
                    {stat.badge}
                  </span>
                </div>
              ) : (
                <div className="text-sm">
                  {stat.change && (
                    <>
                      <i className="fas fa-arrow-up text-xs"></i>
                      <span className={`${stat.changeColor} ml-1`}>{stat.change}</span>
                    </>
                  )}
                  {stat.changeText && (
                    <span className="text-muted-foreground ml-1">{stat.changeText}</span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
