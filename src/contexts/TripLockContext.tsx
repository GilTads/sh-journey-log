import React, { createContext, useContext, useState, ReactNode } from "react";

type TripLockContextType = {
  isTripLocked: boolean;
  setTripLocked: (locked: boolean) => void;
};

const TripLockContext = createContext<TripLockContextType | undefined>(undefined);

export const TripLockProvider = ({ children }: { children: ReactNode }) => {
  const [isTripLocked, setTripLocked] = useState(false);

  return (
    <TripLockContext.Provider value={{ isTripLocked, setTripLocked }}>
      {children}
    </TripLockContext.Provider>
  );
};

export const useTripLock = (): TripLockContextType => {
  const ctx = useContext(TripLockContext);
  if (!ctx) {
    throw new Error("useTripLock must be used within TripLockProvider");
  }
  return ctx;
};
