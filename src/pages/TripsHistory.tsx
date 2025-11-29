// src/pages/TripsHistory.tsx
import { Header } from "@/components/Header";
import { TripsHistoryList } from "@/components/TripsHistoryList";

const TripsHistory = () => {
  return (
    <div className="min-h-screen bg-muted">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-4">
        <TripsHistoryList />
      </main>
    </div>
  );
};

export default TripsHistory;
