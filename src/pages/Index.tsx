import { Header } from "@/components/Header";
import { TripForm } from "@/components/TripForm";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-8">
        <TripForm />
      </main>
    </div>
  );
};

export default Index;
