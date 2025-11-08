import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth-store'
import { AppLayout } from '@/layouts/app-layout'

export const ProtectedRoute = () => {
  const { user } = useAuthStore()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <AppLayout />
}
