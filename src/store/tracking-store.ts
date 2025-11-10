import { create } from 'zustand'

export interface TrackingLocation {
  lat: number
  lon: number
  accuracy: number
}

interface TrackingSnapshot {
  isTracking: boolean
  location: TrackingLocation | null
  lastHeartbeat: number | null
  error: string | null
}

interface TrackingState extends TrackingSnapshot {
  setTrackingState: (partial: Partial<TrackingSnapshot>) => void
  resetTracking: () => void
}

export const useTrackingStore = create<TrackingState>((set) => ({
  isTracking: false,
  location: null,
  lastHeartbeat: null,
  error: null,
  setTrackingState: (partial) =>
    set((state) => ({
      ...state,
      ...partial,
    })),
  resetTracking: () =>
    set({
      isTracking: false,
      location: null,
      lastHeartbeat: null,
      error: null,
    }),
}))
