import { useContext } from 'react'
import { TrackingContext } from '@/context/tracking-context-value'

export const useTracking = () => {
  const context = useContext(TrackingContext)
  if (!context) {
    throw new Error('useTracking debe usarse dentro de TrackingProvider')
  }
  return context
}
