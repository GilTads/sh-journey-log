import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfflineProvider } from "@/contexts/OfflineContext";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <OfflineProvider>
      <App />
    </OfflineProvider>
  </QueryClientProvider>
);
