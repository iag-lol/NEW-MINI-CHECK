import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  mobileRoute: 'formulario' | 'dashboard' | 'comunicacion' | 'pendientes' | 'perfil'
  pendingCount: number
  toggleSidebar: () => void
  setMobileRoute: (route: UIState['mobileRoute']) => void
  setPendingCount: (value: number) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileRoute: 'formulario',
      pendingCount: 0,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setMobileRoute: (route) => set({ mobileRoute: route }),
      setPendingCount: (value) => set({ pendingCount: value }),
    }),
    {
      name: 'nmcheck-ui',
      version: 1,
    }
  )
)
