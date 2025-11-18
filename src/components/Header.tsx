import { Truck } from "lucide-react";

export const Header = () => {
  return (
    <header className="bg-primary text-primary-foreground shadow-md sticky top-0 z-50">
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex items-center justify-center gap-3">
          <Truck className="h-7 w-7" />
          <h1 className="text-xl font-bold">Registro de Viagem SH</h1>
        </div>
      </div>
    </header>
  );
};
