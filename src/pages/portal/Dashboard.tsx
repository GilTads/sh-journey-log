import { useState } from "react";
import { Link } from "react-router-dom";
import { Car, Users, MapPin, Activity, ArrowRight } from "lucide-react";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { StatsCard } from "@/components/portal/StatsCard";
import { TripsTable } from "@/components/portal/TripsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStats, usePortalTrips } from "@/hooks/usePortalTrips";

const Dashboard = () => {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentTrips, isLoading: tripsLoading } = usePortalTrips({});

  const limitedTrips = recentTrips?.slice(0, 5) || [];

  return (
    <PortalLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral do sistema de viagens
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total de Viagens"
            value={statsLoading ? "..." : stats?.totalTrips || 0}
            icon={Car}
          />
          <StatsCard
            title="Viagens Ativas"
            value={statsLoading ? "..." : stats?.activeTrips || 0}
            icon={Activity}
          />
          <StatsCard
            title="KM Percorridos"
            value={statsLoading ? "..." : `${stats?.totalKm?.toLocaleString() || 0}`}
            icon={MapPin}
            description="Total acumulado"
          />
          <StatsCard
            title="Motoristas"
            value={statsLoading ? "..." : stats?.totalDrivers || 0}
            icon={Users}
          />
        </div>

        {/* Recent Trips */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Viagens Recentes</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/portal/trips">
                Ver todas
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <TripsTable trips={limitedTrips} isLoading={tripsLoading} />
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
};

export default Dashboard;
