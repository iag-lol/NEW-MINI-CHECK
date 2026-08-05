import { createContext } from 'react'
import type { TrackingSnapshot } from '@/hooks/use-realtime-location'

export interface TrackingContextValue extends TrackingSnapshot {
  startTracking: () => Promise<void> | void
  stopTracking: () => Promise<void> | void
  refreshLocation: () => Promise<void>
}

export const TrackingContext = createContext<TrackingContextValue | null>(null)
