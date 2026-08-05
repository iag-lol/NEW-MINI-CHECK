import type { ReactNode } from 'react'
import {
  TrackingContext,
  type TrackingContextValue,
} from '@/context/tracking-context-value'

interface TrackingProviderProps {
  value: TrackingContextValue
  children: ReactNode
}

export const TrackingProvider = ({ value, children }: TrackingProviderProps) => (
  <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>
)
