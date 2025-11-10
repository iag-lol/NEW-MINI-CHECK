import { createContext, useContext, type ReactNode } from 'react'
import type { TrackingSnapshot } from '@/hooks/use-realtime-location'

export interface TrackingContextValue extends TrackingSnapshot {
  startTracking: () => Promise<void> | void
  stopTracking: () => Promise<void> | void
  refreshLocation: () => Promise<void>
}

const TrackingContext = createContext<TrackingContextValue | null>(null)

interface TrackingProviderProps {
  value: TrackingContextValue
  children: ReactNode
}

export const TrackingProvider = ({ value, children }: TrackingProviderProps) => (
  <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>
)

export const useTracking = () => {
  const context = useContext(TrackingContext)
  if (!context) {
    throw new Error('useTracking debe usarse dentro de TrackingProvider')
  }
  return context
}
