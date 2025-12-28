import { useState } from 'react';
import { AseoRutLogin } from '../components/AseoRutLogin';
import { BottomNav } from '../components/BottomNav';
import { AseoForm } from '../components/AseoForm';
import { MyRecords } from '../components/MyRecords';
import { Tasks } from '../components/Tasks';
import { Stats } from '../components/Stats';
import { Notifications } from '../components/Notifications';
import { AseoInfoSection } from '../components/AseoInfoSection';
import { AseoPendingBusesSection } from '../components/AseoPendingBusesSection';
import { useFetchNotifications, useFetchTasks } from '../hooks';
import { Icon } from '../../../shared/components/common/Icon';
import { pushNotificationService } from '../../../shared/services/pushNotifications';

type Tab = 'form' | 'records' | 'tasks' | 'stats' | 'info' | 'pending';

export const AseoMobilePage = () => {
    const [rut, setRut] = useState<string | null>(null);
    const [cleanerId, setCleanerId] = useState<string | null>(null);
    const [fullName, setFullName] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('form');

    const { data: notifications = [] } = useFetchNotifications(cleanerId || undefined);
    const unreadCount = notifications.filter(n => !n.read).length;

    const { data: tasks = [] } = useFetchTasks(cleanerId || '');
    const pendingTasksCount = tasks.filter(t => t.status === 'PENDIENTE').length;

    const handleLogin = async (userRut: string, userName: string, userCleanerId: string) => {
        setRut(userRut);
        setFullName(userName);
        setCleanerId(userCleanerId);

        // Initialize push notifications
        try {
            if (pushNotificationService.isSupported()) {
                const subscription = await pushNotificationService.initialize();
                if (subscription) {
                    console.log('✅ Push notifications enabled');
                    // TODO: Send subscription to backend to store in database
                } else {
                    console.log('⚠️ Push notifications not enabled');
                }
            }
        } catch (error) {
            console.error('Failed to initialize push notifications:', error);
        }
    };

    const handleLogout = () => {
        setRut(null);
        setFullName(null);
        setCleanerId(null);
        setActiveTab('form');
    };

    if (!rut || !fullName || !cleanerId) {
        return <AseoRutLogin onLogin={handleLogin} />;
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            {/* Header */}
            <header className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white px-4 py-4 shadow-lg sticky top-0 z-10">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-black flex items-center gap-2">
                            <Icon name="sparkles" size={24} />
                            Portal Aseo
                        </h1>
                        <p className="text-sm text-blue-100 truncate">Hola, {fullName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg">
                            <span className="text-lg font-bold">{fullName.charAt(0).toUpperCase()}</span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors"
                            title="Cerrar sesión"
                        >
                            <Icon name="x" size={20} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="p-4 max-w-2xl mx-auto">
                {activeTab === 'form' && <AseoForm cleanerId={cleanerId} cleanerName={fullName} />}
                {activeTab === 'records' && <MyRecords cleanerId={cleanerId} />}
                {activeTab === 'tasks' && <Tasks cleanerId={cleanerId} />}
                {activeTab === 'stats' && <Stats cleanerId={cleanerId} />}
                {activeTab === 'info' && <AseoInfoSection rut={rut} />}
                {activeTab === 'pending' && <AseoPendingBusesSection />}
            </main>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-2xl z-20">
                <div className="grid grid-cols-6 gap-0.5">
                    <button
                        onClick={() => setActiveTab('form')}
                        className={`flex flex-col items-center justify-center py-2 px-1 transition-all ${activeTab === 'form'
                            ? 'text-indigo-600 bg-indigo-50'
                            : 'text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <Icon name="edit" size={20} />
                        <span className="text-[10px] font-bold mt-0.5">Registrar</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('info')}
                        className={`flex flex-col items-center justify-center py-2 px-1 transition-all ${activeTab === 'info'
                            ? 'text-indigo-600 bg-indigo-50'
                            : 'text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <Icon name="user" size={20} />
                        <span className="text-[10px] font-bold mt-0.5">Mi Info</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('records')}
                        className={`flex flex-col items-center justify-center py-2 px-1 transition-all ${activeTab === 'records'
                            ? 'text-indigo-600 bg-indigo-50'
                            : 'text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <Icon name="image" size={20} />
                        <span className="text-[10px] font-bold mt-0.5">Registros</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('tasks')}
                        className={`relative flex flex-col items-center justify-center py-2 px-1 transition-all ${activeTab === 'tasks'
                            ? 'text-indigo-600 bg-indigo-50'
                            : 'text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        {pendingTasksCount > 0 && (
                            <span className="absolute top-1 right-2 w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shadow-lg">
                                {pendingTasksCount}
                            </span>
                        )}
                        <Icon name="check-circle" size={20} />
                        <span className="text-[10px] font-bold mt-0.5">Tareas</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={`flex flex-col items-center justify-center py-2 px-1 transition-all ${activeTab === 'stats'
                            ? 'text-indigo-600 bg-indigo-50'
                            : 'text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <Icon name="bar-chart" size={20} />
                        <span className="text-[10px] font-bold mt-0.5">Resumen</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`flex flex-col items-center justify-center py-2 px-1 transition-all ${activeTab === 'pending'
                            ? 'text-red-600 bg-red-50'
                            : 'text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <Icon name="truck" size={20} />
                        <span className="text-[10px] font-bold mt-0.5">Pendientes</span>
                    </button>
                </div>
            </nav>
        </div>
    );
};
