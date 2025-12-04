import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const navItems = [
    { icon: "fas fa-tachometer-alt", label: "Dashboard", active: true },
    { icon: "fas fa-ban", label: "Anti-Raid" },
    { icon: "fas fa-eye-slash", label: "NSFW Protection" },
    { icon: "fas fa-comments", label: "Anti-Spam" },
    { icon: "fas fa-code", label: "Bypass Detection" },
    { icon: "fas fa-list-alt", label: "Incident Logs" },
    { icon: "fas fa-cog", label: "Settings" },
  ];

  return (
    <div className={cn("hidden md:flex md:w-64 md:flex-col", className)}>
      <div className="flex flex-col flex-1 min-h-0 bg-card border-r border-border">
        {/* Logo */}
        <div className="flex items-center h-16 flex-shrink-0 px-4 bg-primary">
          <i className="fas fa-shield-alt text-primary-foreground text-2xl mr-3"></i>
          <span className="text-primary-foreground font-bold text-lg">SecureBot Pro</span>
        </div>
        
        {/* Navigation */}
        <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto scrollbar-thin">
          <nav className="mt-5 flex-1 px-2 space-y-1">
            {navItems.map((item) => (
              <a
                key={item.label}
                href="#"
                className={cn(
                  "group flex items-center px-2 py-2 text-sm font-medium rounded-md",
                  item.active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <i className={`${item.icon} mr-3 text-sm`}></i>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        
        {/* Bot Status */}
        <div className="flex-shrink-0 px-4 pb-4">
          <div className="bg-accent rounded-lg p-3">
            <div className="flex items-center">
              <div className="status-indicator bg-accent-foreground rounded-full h-2 w-2 mr-2"></div>
              <span className="text-accent-foreground text-sm font-medium">Bot Online</span>
            </div>
            <div className="text-accent-foreground text-xs mt-1 opacity-90">
              Uptime: 15d 8h 42m
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
