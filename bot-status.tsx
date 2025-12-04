import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BotStats {
  systemStatus: string;
  apiLatency: string;
  memoryUsage: string;
  activeServers: number;
  uptime: string;
}

interface SystemHealth {
  cpuUsage: number;
  ramUsage: number;
  networkIO: string;
  protectionModules: {
    antiRaid: string;
    nsfwDetection: string;
    spamFilter: string;
    bypassDetection: string;
  };
}

export function BotStatus() {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: initialStats, isLoading: statsLoading } = useQuery<BotStats>({
    queryKey: ["/api/stats"],
  });

  const { data: initialHealth, isLoading: healthLoading } = useQuery<SystemHealth>({
    queryKey: ["/api/health"],
  });

  // WebSocket connection for real-time updates
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  const { lastMessage } = useWebSocket(wsUrl);

  useEffect(() => {
    if (initialStats) setStats(initialStats);
  }, [initialStats]);

  useEffect(() => {
    if (initialHealth) setHealth(initialHealth);
  }, [initialHealth]);

  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'stats_update') {
        setStats(lastMessage.data);
      } else if (lastMessage.type === 'health_update') {
        setHealth(lastMessage.data);
      }
    }
  }, [lastMessage]);

  const generateReportMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/actions/status-report", {});
    },
    onSuccess: () => {
      toast({
        title: "Report Generated",
        description: "Security report has been generated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate security report",
        variant: "destructive",
      });
    },
  });

  const getModuleStatus = (status: string) => {
    switch (status) {
      case 'active':
        return { badge: 'bg-accent text-accent-foreground', text: 'ACTIVE' };
      case 'learning':
        return { badge: 'bg-chart-3 text-background', text: 'LEARNING' };
      case 'disabled':
        return { badge: 'bg-muted text-muted-foreground', text: 'DISABLED' };
      default:
        return { badge: 'bg-muted text-muted-foreground', text: 'UNKNOWN' };
    }
  };

  if (statsLoading || healthLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bot Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="bot-status">
      <CardHeader>
        <CardTitle>Bot Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">System Status</span>
          <div className="flex items-center">
            <div className="status-indicator bg-accent rounded-full h-2 w-2 mr-2"></div>
            <span className="text-sm text-accent font-medium capitalize" data-testid="system-status">
              {health?.systemStatus || 'Unknown'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">API Latency</span>
          <span className="text-sm text-foreground font-medium" data-testid="api-latency">
            {stats?.apiLatency || '45ms'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Memory Usage</span>
          <span className="text-sm text-foreground font-medium" data-testid="memory-usage">
            {stats?.memoryUsage || '340MB'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Active Servers</span>
          <span className="text-sm text-foreground font-medium" data-testid="active-servers">
            {stats?.activeServers || 0}
          </span>
        </div>
        
        <div className="pt-4 border-t border-border">
          <div className="text-sm text-muted-foreground mb-2">Protection Modules</div>
          <div className="space-y-2">
            {health?.protectionModules && Object.entries(health.protectionModules).map(([module, status]) => {
              const moduleStatus = getModuleStatus(status);
              const moduleName = module.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
              
              return (
                <div key={module} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{moduleName}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${moduleStatus.badge}`}>
                    {moduleStatus.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        
        <Button
          onClick={() => generateReportMutation.mutate()}
          disabled={generateReportMutation.isPending}
          className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80 mt-4"
          data-testid="button-generate-report"
        >
          <i className="fas fa-download mr-2"></i>
          {generateReportMutation.isPending ? 'Generating...' : 'Generate MD Report'}
        </Button>
      </CardContent>
    </Card>
  );
}
