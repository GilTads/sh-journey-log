// src/components/PullToRefresh.tsx
import React, { ReactNode, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  isRefreshing?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Componente de "puxar para atualizar" (pull-to-refresh)
 * Funciona em qualquer container scrollável (mobile/web)
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  isRefreshing = false,
  children,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isLocallyRefreshing, setIsLocallyRefreshing] = useState(false);

  const MAX_PULL = 120;
  const THRESHOLD = 60;

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const container = containerRef.current;
    if (!container) return;

    // Só começa o pull se estiver no topo
    if (container.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
      setIsPulling(true);
    } else {
      startYRef.current = null;
      setIsPulling(false);
    }
  };

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (!isPulling || startYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    // Só considera arrasto para baixo
    if (diff > 0) {
      const distance = Math.min(diff, MAX_PULL);
      setPullDistance(distance);
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = async () => {
    if (!isPulling) return;

    const shouldRefresh = pullDistance >= THRESHOLD;
    setIsPulling(false);
    setPullDistance(0);

    if (shouldRefresh && !isRefreshing && !isLocallyRefreshing) {
      try {
        setIsLocallyRefreshing(true);
        await onRefresh();
      } finally {
        setIsLocallyRefreshing(false);
      }
    }
  };

  const showSpinner = isRefreshing || isLocallyRefreshing;
  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-y-auto", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Área que desce junto com o pull */}
      <div
        className="transition-transform duration-150"
        style={{
          transform:
            isPulling || showSpinner
              ? `translateY(${pullDistance}px)`
              : "translateY(0px)",
        }}
      >
        {/* Indicador visual de pull-to-refresh */}
        <div className="h-10 flex items-center justify-center text-xs text-muted-foreground">
          {showSpinner ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Sincronizando...</span>
            </span>
          ) : (
            pullDistance > 0 && (
              <span className="flex items-center gap-2">
                <Loader2
                  className="h-4 w-4"
                  style={{ opacity: progress, transform: `scale(${0.7 + 0.3 * progress})` }}
                />
                <span>
                  {pullDistance < THRESHOLD
                    ? "Puxe para sincronizar"
                    : "Solte para sincronizar"}
                </span>
              </span>
            )
          )}
        </div>

        {/* Conteúdo real da tela */}
        {children}
      </div>
    </div>
  );
};
