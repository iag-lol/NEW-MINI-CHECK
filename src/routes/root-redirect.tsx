import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth-store'

export const RootRedirect = () => {
  const { user, lastVisitedPath } = useAuthStore()
  const target = user ? lastVisitedPath || '/app/formulario' : '/login'
  return <Navigate to={target} replace />
}
