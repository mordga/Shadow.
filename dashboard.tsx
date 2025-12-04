import { Sidebar } from "@/components/sidebar";
import { StatsOverview } from "@/components/stats-overview";
import { ThreatMonitor } from "@/components/threat-monitor";
import { BotStatus } from "@/components/bot-status";
import { BypassDetection } from "@/components/bypass-detection";
import { RecoveryPanel } from "@/components/recovery-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SystemHealth {
  cpuUsage: number;
  ramUsage: number;
  networkIO: string;
}

export default function Dashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const { toast } = useToast();

  const { data: initialHealth } = useQuery<SystemHealth>({
    queryKey: ["/api/health"],
  });

  // WebSocket connection for real-time updates
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  const { lastMessage, isConnected } = useWebSocket(wsUrl);

  useEffect(() => {
    if (initialHealth) setHealth(initialHealth);
  }, [initialHealth]);

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'health_update') {
      setHealth(lastMessage.data);
    }
  }, [lastMessage]);

  const emergencyLockdownMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/actions/emergency-lockdown", { serverId: "manual" });
    },
    onSuccess: () => {
      toast({
        title: "Emergency Lockdown Activated",
        description: "All servers have been locked down immediately",
        variant: "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to activate emergency lockdown",
        variant: "destructive",
      });
    },
  });

  const runDiagnosticsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/actions/run-diagnostics", {});
    },
    onSuccess: () => {
      toast({
        title: "Diagnostics Complete",
        description: "System diagnostics completed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to run system diagnostics",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-card shadow-sm border-b border-border">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <button className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground">
                  <i className="fas fa-bars text-lg"></i>
                </button>
                <h1 className="ml-4 md:ml-0 text-2xl font-bold text-foreground">
                  Security Dashboard
                </h1>
              </div>
              <div className="flex items-center space-x-4">
                {/* Connection Status */}
                <div className="flex items-center space-x-2">
                  <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-accent status-indicator' : 'bg-destructive'}`}></div>
                  <span className="text-sm text-muted-foreground">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                
                {/* Alert Indicator */}
                <div className="relative">
                  <button className="p-2 rounded-full bg-destructive alert-flash">
                    <i className="fas fa-exclamation-triangle text-destructive-foreground"></i>
                  </button>
                  <div className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    3
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Last scan: <span>2 minutes ago</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            
            {/* Stats Overview */}
            <StatsOverview />

            {/* Main Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column */}
              <div className="lg:col-span-2 space-y-8">
                <ThreatMonitor />
                <BypassDetection />
                <RecoveryPanel />
              </div>

              {/* Right Column */}
              <div className="space-y-8">
                <BotStatus />
                
                {/* UptimeRobot URL */}
                <Card data-testid="uptimerobot-url">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <i className="fas fa-link text-accent"></i>
                      URL para UptimeRobot
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-muted p-3 rounded-lg border border-border">
                      <p className="text-xs text-muted-foreground mb-2">URL de Monitoreo:</p>
                      <code className="text-xs break-all text-foreground font-mono" data-testid="text-uptimerobot-url">
                        {window.location.origin}/api/ping
                      </code>
                    </div>
                    
                    <Button
                      onClick={() => {
                        const url = `${window.location.origin}/api/ping`;
                        navigator.clipboard.writeText(url).then(() => {
                          toast({
                            title: "URL Copiada ✓",
                            description: "La URL de UptimeRobot se copió al portapapeles",
                          });
                        }).catch(() => {
                          toast({
                            title: "Error",
                            description: "No se pudo copiar la URL",
                            variant: "destructive",
                          });
                        });
                      }}
                      className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                      data-testid="button-copy-url"
                    >
                      <i className="fas fa-copy mr-2"></i>
                      Copiar URL
                    </Button>
                    
                    <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg">
                      <p className="text-xs text-blue-400 flex items-start gap-2">
                        <i className="fas fa-info-circle mt-0.5"></i>
                        <span>
                          Usa esta URL en UptimeRobot para mantener tu bot activo 24/7. 
                          Configura el monitor cada 5 minutos.
                        </span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Quick Actions */}
                <Card data-testid="quick-actions">
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      onClick={() => emergencyLockdownMutation.mutate()}
                      disabled={emergencyLockdownMutation.isPending}
                      className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-emergency-lockdown"
                    >
                      <i className="fas fa-shield-alt mr-2"></i>
                      {emergencyLockdownMutation.isPending ? 'Activating...' : 'Emergency Lockdown'}
                    </Button>
                    
                    <Button
                      className="w-full bg-chart-3 text-background hover:bg-chart-3/90"
                      data-testid="button-update-filters"
                    >
                      <i className="fas fa-sync-alt mr-2"></i>
                      Update All Filters
                    </Button>
                    
                    <Button
                      onClick={() => runDiagnosticsMutation.mutate()}
                      disabled={runDiagnosticsMutation.isPending}
                      className="w-full bg-chart-5 text-white hover:bg-chart-5/90"
                      data-testid="button-run-diagnostics"
                    >
                      <i className="fas fa-stethoscope mr-2"></i>
                      {runDiagnosticsMutation.isPending ? 'Running...' : 'Run Diagnostics'}
                    </Button>
                    
                    <Button
                      className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      data-testid="button-export-logs"
                    >
                      <i className="fas fa-file-export mr-2"></i>
                      Export Logs
                    </Button>
                  </CardContent>
                </Card>

                {/* System Health */}
                <Card data-testid="system-health">
                  <CardHeader>
                    <CardTitle>System Health</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* CPU Usage */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">CPU Usage</span>
                          <span className="text-foreground font-medium" data-testid="cpu-usage">
                            {health?.cpuUsage || 23}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className="bg-accent h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${health?.cpuUsage || 23}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      {/* RAM Usage */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">RAM Usage</span>
                          <span className="text-foreground font-medium" data-testid="ram-usage">
                            {health?.ramUsage || 67}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className="bg-chart-3 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${health?.ramUsage || 67}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      {/* Network I/O */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Network I/O</span>
                          <span className="text-foreground font-medium" data-testid="network-io">
                            {health?.networkIO || '142KB/s'}
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className="bg-chart-5 h-2 rounded-full" style={{ width: '35%' }}></div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
