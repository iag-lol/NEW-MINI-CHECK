import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth-store'
import type { Role } from '@/types/database'

/**
 * Protege una ruta por cargo. Si el usuario no tiene el rol requerido,
 * se redirige al formulario de inspección.
 */
export const RequireRole = ({ roles, children }: { roles: Role[]; children: ReactNode }) => {
  const { user } = useAuthStore()

  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.cargo)) return <Navigate to="/app/formulario" replace />

  return <>{children}</>
}
