import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Car, Map, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: "/portal", label: "Dashboard", icon: LayoutDashboard },
  { path: "/portal/trips", label: "Viagens", icon: Car },
];

export const PortalLayout = ({ children }: PortalLayoutProps) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border hidden md:flex flex-col">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-bold text-primary">RDV Portal</h1>
          <p className="text-xs text-muted-foreground mt-1">Gestão de Viagens</p>
        </div>
        
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-border">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">Voltar ao App</span>
          </Link>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-50 flex items-center justify-between px-4">
        <h1 className="text-lg font-bold text-primary">RDV Portal</h1>
        <div className="flex gap-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "p-2 rounded-lg",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:p-8 p-4 pt-20 md:pt-8 overflow-auto">
        {children}
      </main>
    </div>
  );
};
