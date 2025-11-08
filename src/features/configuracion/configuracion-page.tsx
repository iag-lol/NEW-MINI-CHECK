import { useState } from 'react'
import { BellRing, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { playNotificationTone } from '@/lib/sound'

export const ConfiguracionPage = () => {
  const [realtimeEnabled, setRealtimeEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)

  const requestPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission()
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm font-semibold text-slate-500">Notificaciones push</p>
          <p className="text-sm text-slate-400">
            Controla si la app puede mostrar banners del sistema.
          </p>
        </div>
        <Switch checked={realtimeEnabled} onCheckedChange={setRealtimeEnabled} />
        <Button variant="ghost" className="gap-2" onClick={requestPermission}>
          <BellRing className="h-4 w-4" />
          Activar
        </Button>
      </Card>
      <Card className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm font-semibold text-slate-500">Sonido</p>
          <p className="text-sm text-slate-400">Compatibilidad con Android, iOS y desktop.</p>
        </div>
        <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
        <Button variant="outline" className="gap-2" onClick={() => soundEnabled && playNotificationTone()}>
          <Volume2 className="h-4 w-4" />
          Probar
        </Button>
      </Card>
    </div>
  )
}
