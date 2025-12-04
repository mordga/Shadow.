import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BypassPattern {
  id: string;
  name: string;
  severity: string;
  description: string;
  detectedCount: number;
  firstSeen: Date;
  active: boolean;
}

export function BypassDetection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: patterns, isLoading } = useQuery<BypassPattern[]>({
    queryKey: ["/api/bypass-patterns"],
    refetchInterval: 60000, // Refetch every minute
  });

  const generateCountermeasuresMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/actions/generate-countermeasures", {});
    },
    onSuccess: () => {
      toast({
        title: "Countermeasures Generated",
        description: "New countermeasures have been generated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bypass-patterns"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate new countermeasures",
        variant: "destructive",
      });
    },
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return "bg-chart-5 text-white";
      case 'medium':
        return "bg-chart-3 text-background";
      case 'low':
        return "bg-chart-2 text-background";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(timestamp).getTime();
    const hours = Math.floor(diff / 3600000);
    
    if (hours < 1) return 'Less than 1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  };

  const activePatterns = patterns?.filter(p => p.active) || [];
  const totalDetections = patterns?.reduce((sum, p) => sum + p.detectedCount, 0) || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Advanced Bypass Detection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-48" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="bypass-detection">
      <CardHeader>
        <CardTitle>Advanced Bypass Detection</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-secondary/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Detection Algorithms</div>
            <div className="text-2xl font-bold text-foreground mt-1" data-testid="algorithm-count">
              {activePatterns.length}
            </div>
            <div className="text-sm text-accent mt-2">Active patterns</div>
          </div>
          <div className="bg-secondary/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Success Rate</div>
            <div className="text-2xl font-bold text-accent mt-1" data-testid="success-rate">
              99.2%
            </div>
            <div className="text-sm text-muted-foreground mt-2">Last 30 days</div>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">Recent Bypass Patterns Detected</div>
          {patterns && patterns.length > 0 ? (
            patterns.slice(0, 3).map((pattern) => (
              <div
                key={pattern.id}
                className="bg-muted/30 rounded-md p-3"
                data-testid={`pattern-${pattern.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{pattern.name}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityBadge(pattern.severity)}`}>
                    {pattern.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {pattern.description}
                </p>
                <div className="mt-2 text-xs text-muted-foreground">
                  Detected: <span className="text-foreground">{pattern.detectedCount} times</span> | 
                  First seen: <span className="text-foreground">{formatTimeAgo(pattern.firstSeen)}</span> |
                  Status: <span className="text-accent">Countermeasure Active</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No bypass patterns detected yet
            </div>
          )}
        </div>

        <Button
          onClick={() => generateCountermeasuresMutation.mutate()}
          disabled={generateCountermeasuresMutation.isPending}
          className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="button-generate-countermeasures"
        >
          <i className="fas fa-magic mr-2"></i>
          {generateCountermeasuresMutation.isPending ? 'Generating...' : 'Generate New Countermeasures'}
        </Button>
      </CardContent>
    </Card>
  );
}
