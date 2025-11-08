import { useAuthStore } from '@/store/auth-store'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const PerfilPage = () => {
  const { user, logout } = useAuthStore()
  if (!user) return null
  return (
    <Card className="space-y-3 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-500">Perfil</p>
      <h2 className="text-3xl font-black text-slate-900 dark:text-white">{user.nombre}</h2>
      <p className="text-sm text-slate-500">
        {user.cargo} · Terminal {user.terminal}
      </p>
      <Button variant="outline" onClick={logout} className="rounded-2xl">
        Cerrar sesión
      </Button>
    </Card>
  )
}
