import { Menu, RefreshCw, Info } from "lucide-react";
import { Link } from "react-router-dom";
import logo from "@/assets/icon.png";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useOfflineData } from "@/contexts/OfflineContext";
import { Capacitor } from "@capacitor/core";

export const Header = () => {
  const { syncNow, isSyncing, isOnline, lastSyncAt } = useOfflineData();

  const handleSync = () => {
    syncNow();
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return "Nunca";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Agora";
    if (diffMins < 60) return `${diffMins} min atrás`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    return date.toLocaleDateString();
  };

  return (
    <header className="bg-primary text-primary-foreground shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-primary/90"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>

            {/* layout em coluna */}
            <SheetContent side="left" className="w-64 flex flex-col">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              {/* LINKS PRINCIPAIS */}
              <nav className="flex flex-col gap-2 mt-6 flex-1">
                <Link
                  to="/"
                  className="px-4 py-2 rounded-md hover:bg-accent text-foreground transition-colors"
                >
                  Registro de Viagem
                </Link>

                <Link
                  to="/historico"
                  className="px-4 py-2 rounded-md hover:bg-accent text-foreground transition-colors"
                >
                  Histórico de Viagens
                </Link>
              </nav>

              {/* RODAPÉ – Status, TI e Sync */}
              <div className="mt-auto pt-4 border-t border-border">
                <Link
                  to="/debug-info"
                  className="px-4 py-2 rounded-md hover:bg-accent text-foreground transition-colors flex items-center gap-2 mb-4"
                >
                 {/*<Info className="h-4 w-4 text-primary" /> */}
                  Informações para a TI
                </Link>

                {Capacitor.isNativePlatform() && (
                  <>
                    <div className="px-4 mb-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        Status: {isOnline ? "Online" : "Offline"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Última sinc.: {formatLastSync(lastSyncAt)}
                      </p>
                    </div>

                    <Button
                      onClick={handleSync}
                      disabled={isSyncing || !isOnline}
                      className="w-full mb-1"
                      variant="outline"
                    >
                      {isSyncing ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Sincronizar Agora
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-3">
            <img src={logo} alt="Santa Helena" className="h-12 w-auto" />
          </div>

          <div className="w-10" />
        </div>
      </div>
    </header>
  );
};
