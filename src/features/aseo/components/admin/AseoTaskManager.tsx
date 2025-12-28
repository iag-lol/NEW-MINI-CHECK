import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../../../shared/components/common/Icon';
import { fetchAllCleaners, createTask, updateTaskStatus } from '../../api/aseoApi';
import { useFetchAllTasks } from '../../hooks';

export const AseoTaskManager = () => {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        cleaner_id: '',
        title: '',
        description: '',
    });

    const { data: tasks = [] } = useFetchAllTasks();

    const { data: cleaners = [] } = useQuery({
        queryKey: ['aseo', 'cleaners'],
        queryFn: fetchAllCleaners,
    });

    const createTaskMutation = useMutation({
        mutationFn: (data: any) => createTask(data.cleaner_id, data.title, data.description, data.created_by),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['aseo', 'all-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['aseo-tasks'] });
            setShowForm(false);
            setFormData({ cleaner_id: '', title: '', description: '' });
            alert('Tarea creada exitosamente');
        },
    });

    const updateTaskMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: 'PENDIENTE' | 'TERMINADA' }) => updateTaskStatus(id, status),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['aseo', 'all-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['aseo-tasks'] });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.cleaner_id || !formData.title) {
            alert('Por favor complete los campos requeridos');
            return;
        }
        createTaskMutation.mutate({
            ...formData,
            created_by: 'Supervisor',
        });
    };

    const toggleTaskStatus = (task: any) => {
        const newStatus = task.status === 'PENDIENTE' ? 'TERMINADA' : 'PENDIENTE';
        updateTaskMutation.mutate({
            id: task.id,
            status: newStatus,
        });
    };

    const pendingTasks = tasks.filter((t: any) => t.status === 'PENDIENTE');
    const completedTasks = tasks.filter((t: any) => t.status === 'TERMINADA');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
                                <Icon name="check-circle" size={20} className="text-white" />
                            </div>
                            Gestión de Tareas
                        </h2>
                        <p className="text-sm text-slate-600 mt-1">
                            {pendingTasks.length} pendientes • {completedTasks.length} completadas
                        </p>
                    </div>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all"
                    >
                        <Icon name="plus" size={20} />
                        Nueva Tarea
                    </button>
                </div>

                {/* Create Form */}
                {showForm && (
                    <form onSubmit={handleSubmit} className="mt-6 bg-slate-50 rounded-xl p-6 border-2 border-blue-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Asignar a Limpiador *</label>
                                <select
                                    value={formData.cleaner_id}
                                    onChange={(e) => setFormData({ ...formData, cleaner_id: e.target.value })}
                                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    required
                                >
                                    <option value="">Seleccionar...</option>
                                    {cleaners.map((c: any) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Título *</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Ej: Limpiar bus ABCD12"
                                    required
                                />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Descripción</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                rows={3}
                                placeholder="Detalles adicionales..."
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={createTaskMutation.isPending}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50"
                            >
                                {createTaskMutation.isPending ? 'Creando...' : 'Crear Tarea'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl"
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Tasks Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pending */}
                <div>
                    <h3 className="text-lg font-black text-amber-600 mb-4 flex items-center gap-2">
                        <Icon name="clock" size={20} />
                        Pendientes ({pendingTasks.length})
                    </h3>
                    <div className="space-y-3">
                        {pendingTasks.map((task: any) => {
                            const cleaner = cleaners.find((c: any) => c.id === task.cleaner_id);
                            return (
                                <div key={task.id} className="bg-white rounded-xl p-4 shadow-md border-2 border-amber-200 hover:shadow-lg transition-all">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-slate-900 mb-1">{task.title}</h4>
                                            {task.description && (
                                                <p className="text-sm text-slate-600">{task.description}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => toggleTaskStatus(task)}
                                            className="w-8 h-8 bg-amber-100 hover:bg-amber-200 rounded-lg flex items-center justify-center transition-colors"
                                            title="Marcar como completada"
                                        >
                                            <Icon name="check" size={16} className="text-amber-600" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                        <span className="px-2 py-1 bg-indigo-100 text-indigo-700 font-bold rounded-lg">
                                            {cleaner?.name || 'Sin asignar'}
                                        </span>
                                        <span className="text-slate-500">
                                            {new Date(task.created_at).toLocaleDateString('es-CL')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        {pendingTasks.length === 0 && (
                            <div className="text-center py-12 text-slate-400">
                                <Icon name="check-circle" size={40} className="mx-auto mb-3 opacity-30" />
                                <p className="font-semibold">No hay tareas pendientes</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Completed */}
                <div>
                    <h3 className="text-lg font-black text-green-600 mb-4 flex items-center gap-2">
                        <Icon name="check-circle" size={20} />
                        Completadas ({completedTasks.length})
                    </h3>
                    <div className="space-y-3">
                        {completedTasks.map((task: any) => {
                            const cleaner = cleaners.find((c: any) => c.id === task.cleaner_id);
                            return (
                                <div key={task.id} className="bg-white rounded-xl p-4 shadow-md border-2 border-green-200 opacity-75 hover:opacity-100 transition-all">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-slate-900 mb-1 line-through">{task.title}</h4>
                                            {task.description && (
                                                <p className="text-sm text-slate-600">{task.description}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => toggleTaskStatus(task)}
                                            className="w-8 h-8 bg-green-100 hover:bg-green-200 rounded-lg flex items-center justify-center transition-colors"
                                            title="Marcar como pendiente"
                                        >
                                            <Icon name="x" size={16} className="text-green-600" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                        <span className="px-2 py-1 bg-green-100 text-green-700 font-bold rounded-lg">
                                            {cleaner?.name || 'Sin asignar'}
                                        </span>
                                        <span className="text-slate-500">
                                            ✓ {task.completed_at ? new Date(task.completed_at).toLocaleDateString('es-CL') : ''}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        {completedTasks.length === 0 && (
                            <div className="text-center py-12 text-slate-400">
                                <Icon name="inbox" size={40} className="mx-auto mb-3 opacity-30" />
                                <p className="font-semibold">No hay tareas completadas</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
