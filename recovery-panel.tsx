import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface RecoveryStats {
  totalTemplates: number;
  servers: string[];
  lastBackup: Date | null;
}

interface RecoveryReport {
  successful: boolean;
  errors: string[];
  warnings: string[];
  recovered: {
    channels: number;
    roles: number;
    permissions: number;
  };
  failed: {
    channels: string[];
    roles: string[];
    permissions: string[];
  };
  suggestions: string[];
}

export function RecoveryPanel() {
  const [guildId, setGuildId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading } = useQuery<RecoveryStats>({
    queryKey: ["/api/recovery/stats"],
    refetchInterval: 30000,
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      if (!guildId) throw new Error("Guild ID is required");
      return apiRequest("POST", "/api/recovery/backup", { guildId });
    },
    onSuccess: () => {
      toast({
        title: "✅ Backup Created",
        description: "Server template saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recovery/stats"] });
    },
    onError: (error) => {
      toast({
        title: "❌ Error",
        description: `Failed to create backup: ${(error as Error).message}`,
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!guildId) throw new Error("Guild ID is required");
      const res = await apiRequest("POST", "/api/recovery/restore", { guildId, templateId });
      return res.json();
    },
    onSuccess: (data: { report: RecoveryReport }) => {
      const report = data.report;
      toast({
        title: report.successful ? "✅ Successful Recovery" : "⚠️ Partial Recovery",
        description: `Channels: ${report.recovered.channels}, Roles: ${report.recovered.roles}`,
        variant: report.successful ? "default" : "destructive",
      });
    },
    onError: (error) => {
      toast({
        title: "❌ Error",
        description: `Failed to restore: ${(error as Error).message}`,
        variant: "destructive",
      });
    },
  });

  const emergencyMutation = useMutation({
    mutationFn: async () => {
      if (!guildId) throw new Error("Guild ID is required");
      const res = await apiRequest("POST", "/api/recovery/emergency", { guildId });
      return res.json();
    },
    onSuccess: (data: { report: RecoveryReport }) => {
      const report = data.report;
      toast({
        title: "🚨 Emergency Recovery",
        description: `Channels recovered: ${report.recovered.channels}, Roles: ${report.recovered.roles}`,
      });
    },
    onError: (error) => {
      toast({
        title: "❌ Emergency Error",
        description: `Emergency recovery failed: ${(error as Error).message}`,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🔄 Advanced Recovery System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="recovery-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <i className="fas fa-history text-chart-2"></i>
          🔄 Extreme Recovery System
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Estadísticas de Recuperación */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-chart-2/10 border border-chart-2/20 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Saved Templates</div>
            <div className="text-2xl font-bold text-chart-2" data-testid="template-count">
              {stats?.totalTemplates || 0}
            </div>
          </div>
          <div className="bg-chart-3/10 border border-chart-3/20 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Protected Servers</div>
            <div className="text-2xl font-bold text-chart-3" data-testid="server-count">
              {stats?.servers?.length || 0}
            </div>
          </div>
          <div className="bg-chart-5/10 border border-chart-5/20 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Last Backup</div>
            <div className="text-sm font-medium text-chart-5" data-testid="last-backup">
              {stats?.lastBackup 
                ? new Date(stats.lastBackup).toLocaleString()
                : 'Never'}
            </div>
          </div>
        </div>

        {/* Controles de Servidor */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="guild-id">Discord Server ID</Label>
            <Input
              id="guild-id"
              placeholder="Ex: 123456789012345678"
              value={guildId}
              onChange={(e) => setGuildId(e.target.value)}
              data-testid="input-guild-id"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="template-id">Template ID (Optional)</Label>
            <Input
              id="template-id"
              placeholder="Leave empty to use most recent"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              data-testid="input-template-id"
            />
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button
            onClick={() => createBackupMutation.mutate()}
            disabled={createBackupMutation.isPending || !guildId}
            className="bg-chart-2 text-white hover:bg-chart-2/90"
            data-testid="button-create-backup"
          >
            <i className="fas fa-save mr-2"></i>
            {createBackupMutation.isPending ? 'Saving...' : '💾 Create Backup'}
          </Button>
          
          <Button
            onClick={() => restoreMutation.mutate()}
            disabled={restoreMutation.isPending || !guildId}
            className="bg-chart-3 text-background hover:bg-chart-3/90"
            data-testid="button-restore"
          >
            <i className="fas fa-undo mr-2"></i>
            {restoreMutation.isPending ? 'Restoring...' : '🔄 Restore'}
          </Button>
          
          <Button
            onClick={() => emergencyMutation.mutate()}
            disabled={emergencyMutation.isPending || !guildId}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-emergency"
          >
            <i className="fas fa-medkit mr-2"></i>
            {emergencyMutation.isPending ? 'Recovering...' : '🚨 Emergency'}
          </Button>
        </div>

        {/* Información de Capacidades */}
        <div className="bg-muted/30 rounded-lg p-4">
          <h4 className="font-semibold text-foreground mb-2">🛡️ Extreme Recovery Capabilities:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• 🔄 <strong>Automatic Backup:</strong> Templates saved every hour</li>
            <li>• 🕵️ <strong>Post-Attack Analysis:</strong> Recovers even after the attack</li>
            <li>• 📊 <strong>Audit Log Mining:</strong> Scans logs to recover deleted elements</li>
            <li>• 🧠 <strong>Reconstructive AI:</strong> Recreates names and settings based on activity</li>
            <li>• ⚡ <strong>Instant Recovery:</strong> Restores channels, roles and permissions in seconds</li>
            <li>• 🔍 <strong>Intelligent Detection:</strong> Finds patterns in deleted channels</li>
          </ul>
        </div>

        {/* Alerta de Funcionalidad */}
        <div className="bg-accent/10 border border-accent/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <i className="fas fa-magic text-accent mt-1"></i>
            <div>
              <div className="text-sm font-medium text-accent">Anti-Bypass System Activated</div>
              <div className="text-xs text-muted-foreground mt-1">
                This bot can recover your server even if the attack occurred AFTER the bot was added. 
                Uses Discord forensic analysis to reconstruct the original structure.
              </div>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}