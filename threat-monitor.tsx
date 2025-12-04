import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect, useState } from "react";

interface Threat {
  id: string;
  type: string;
  severity: string;
  description: string;
  serverName: string;
  username?: string;
  action: string;
  timestamp: Date;
  metadata?: any;
}

export function ThreatMonitor() {
  const [threats, setThreats] = useState<Threat[]>([]);
  
  const { data: initialThreats, isLoading } = useQuery<Threat[]>({
    queryKey: ["/api/threats"],
    queryFn: async () => {
      const response = await fetch("/api/threats?limit=10");
      return response.json();
    },
  });

  // WebSocket connection for real-time updates
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  const { lastMessage } = useWebSocket(wsUrl);

  useEffect(() => {
    if (initialThreats) {
      setThreats(initialThreats);
    }
  }, [initialThreats]);

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'threat_update') {
      setThreats(lastMessage.data);
    }
  }, [lastMessage]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return "fas fa-exclamation-triangle text-destructive";
      case 'medium':
        return "fas fa-eye-slash text-chart-3";
      case 'low':
        return "fas fa-code text-chart-5";
      default:
        return "fas fa-info-circle text-muted-foreground";
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return "bg-destructive text-destructive-foreground";
      case 'high':
        return "bg-destructive text-destructive-foreground";
      case 'medium':
        return "bg-chart-3 text-background";
      case 'low':
        return "bg-chart-5 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'raid':
        return 'bg-destructive/10 border-destructive/20';
      case 'nsfw':
        return 'bg-chart-3/10 border-chart-3/20';
      case 'bypass':
        return 'bg-chart-5/10 border-chart-5/20';
      case 'spam':
        return 'bg-chart-2/10 border-chart-2/20';
      default:
        return 'bg-muted/10 border-muted/20';
    }
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Real-time Threat Monitor
            <Skeleton className="h-4 w-16" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-80 overflow-y-auto">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 border rounded-md">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="threat-monitor">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Real-time Threat Monitor</span>
          <div className="flex items-center space-x-2">
            <div className="status-indicator bg-accent rounded-full h-2 w-2"></div>
            <span className="text-sm text-muted-foreground">Live</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-80 overflow-y-auto scrollbar-thin">
          {threats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent threats detected
            </div>
          ) : (
            threats.map((threat) => (
              <div
                key={threat.id}
                className={`flex items-start space-x-3 p-3 ${getTypeColor(threat.type)} border rounded-md`}
                data-testid={`threat-${threat.id}`}
              >
                <div className="flex-shrink-0">
                  <i className={getSeverityIcon(threat.severity)}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-foreground capitalize">
                      {threat.type === 'nsfw' ? 'NSFW Content Blocked' : 
                       threat.type === 'raid' ? 'Raid Detected' :
                       threat.type === 'bypass' ? 'Bypass Attempt' :
                       threat.type === 'spam' ? 'Spam Detected' : threat.type}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityBadge(threat.severity)}`}>
                      {threat.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {threat.description}
                  </p>
                  <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                    <span>{formatTimeAgo(threat.timestamp)}</span>
                    <span>Server: {threat.serverName}</span>
                    {threat.username && <span>User: @{threat.username}</span>}
                    <span>Action: {threat.action}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
