import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import TripsHistory from "./pages/TripsHistory";
import DebugInfo from "@/pages/DebugInfo";
import { TripLockProvider } from "./contexts/TripLockContext";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/portal/Dashboard";
import TripsList from "./pages/portal/TripsList";
import TripDetails from "./pages/portal/TripDetails";
import { useOfflineData } from "@/contexts/OfflineContext";
import DeviceRegisterPage from "./pages/DeviceRegisterPage";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { deviceId, isDeviceLoaded } = useOfflineData();

  if (!isDeviceLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Carregando dispositivo registrado...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/registrar-dispositivo" element={<DeviceRegisterPage />} />
      {deviceId ? (
        <>
          <Route path="/" element={<Index />} />
          <Route path="/historico" element={<TripsHistory />} />
          <Route path="/debug-info" element={<DebugInfo />} />
          {/* Portal Routes */}
          <Route path="/portal" element={<Dashboard />} />
          <Route path="/portal/trips" element={<TripsList />} />
          <Route path="/portal/trips/:id" element={<TripDetails />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </>
      ) : (
        <>
          <Route path="*" element={<Navigate to="/registrar-dispositivo" replace />} />
        </>
      )}
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <TripLockProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TripLockProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
