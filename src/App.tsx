import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import TripsHistory from "./pages/TripsHistory";
import DebugInfo from "@/pages/DebugInfo";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/portal/Dashboard";
import TripsList from "./pages/portal/TripsList";
import TripDetails from "./pages/portal/TripDetails";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/historico" element={<TripsHistory />} />
          <Route path="/debug-info" element={<DebugInfo />} />
          {/* Portal Routes */}
          <Route path="/portal" element={<Dashboard />} />
          <Route path="/portal/trips" element={<TripsList />} />
          <Route path="/portal/trips/:id" element={<TripDetails />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
