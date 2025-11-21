import { Menu } from "lucide-react";
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

export const Header = () => {
  return (
    <header className="bg-primary text-primary-foreground shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary/90">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 mt-6">
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
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-3">
            <img src={logo} alt="Santa Helena" className="h-12 w-auto" />
          </div>

          <div className="w-10"></div>
        </div>
      </div>
    </header>
  );
};
