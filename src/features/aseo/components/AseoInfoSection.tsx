import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../../shared/components/common/Icon';
import { supabase } from '../../../shared/lib/supabaseClient';

interface Props {
    rut: string;
}

export const AseoInfoSection = ({ rut }: Props) => {
    // Fetch attendance data for this RUT
    const { data: attendanceInfo, isLoading } = useQuery({
        queryKey: ['aseo', 'attendanceInfo', rut],
        queryFn: async () => {
            // Get staff info
            const { data: staff } = await supabase
                .from('staff')
                .select('*')
                .eq('rut', rut)
                .single();

            if (!staff) return null;

            // Get current week dates
            const now = new Date();
            const dayOfWeek = now.getDay();
            const monday = new Date(now);
            monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);

            const mondayStr = monday.toISOString().split('T')[0];
            const sundayStr = sunday.toISOString().split('T')[0];

            // Get week data
            const dates = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                dates.push(d.toISOString().split('T')[0]);
            }

            // Get marks for this week
            const { data: marks } = await supabase
                .from('attendance_marks')
                .select('*')
                .eq('staff_id', staff.id)
                .gte('mark_date', mondayStr)
                .lte('mark_date', sundayStr);

            // Get licenses
            const { data: licenses } = await supabase
                .from('attendance_licenses')
                .select('*')
                .eq('staff_id', staff.id)
                .gte('start_date', mondayStr)
                .lte('end_date', sundayStr);

            // Get permissions
            const { data: permissions } = await supabase
                .from('attendance_permissions')
                .select('*')
                .eq('staff_id', staff.id)
                .gte('start_date', mondayStr)
                .lte('end_date', sundayStr);

            // Get day changes
            const { data: dayChanges } = await supabase
                .from('attendance_schedule_changes')
                .select('*')
                .eq('rut', rut)
                .gte('date', mondayStr)
                .lte('date', sundayStr);

            // Get incidences
            const [noMarks, noCredentials] = await Promise.all([
                supabase
                    .from('attendance_no_marcaciones')
                    .select('*')
                    .eq('rut', rut)
                    .gte('date', mondayStr)
                    .lte('date', sundayStr),
                supabase
                    .from('attendance_sin_credenciales')
                    .select('*')
                    .eq('rut', rut)
                    .gte('date', mondayStr)
                    .lte('date', sundayStr),
            ]);

            return {
                staff,
                weekDates: dates,
                marks: marks || [],
                licenses: licenses || [],
                permissions: permissions || [],
                dayChanges: dayChanges || [],
                noMarks: noMarks.data || [],
                noCredentials: noCredentials.data || [],
            };
        },
        refetchInterval: 60000, // Refresh every minute
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Icon name="loader" size={32} className="animate-spin text-indigo-600" />
            </div>
        );
    }

    if (!attendanceInfo) {
        return (
            <div className="text-center py-8">
                <Icon name="alert-circle" size={40} className="mx-auto mb-3 text-slate-400" />
                <p className="text-slate-600 font-semibold">No se encontró información</p>
            </div>
        );
    }

    const { staff, weekDates, marks, licenses, permissions, dayChanges, noMarks, noCredentials } = attendanceInfo;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
                <h2 className="text-2xl font-black mb-2">{staff.nombre}</h2>
                <div className="flex flex-wrap gap-2 text-sm mb-3">
                    <span className="px-3 py-1 bg-white/20 rounded-full font-semibold">
                        <Icon name="user" size={14} className="inline mr-1" />
                        {staff.cargo}
                    </span>
                    <span className="px-3 py-1 bg-white/20 rounded-full font-semibold">
                        <Icon name="x" size={14} className="inline mr-1" />
                        {staff.terminal_code}
                    </span>
                    <span className="px-3 py-1 bg-white/20 rounded-full font-semibold">
                        <Icon name="clock" size={14} className="inline mr-1" />
                        {staff.horario || 'Sin horario'}
                    </span>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/20">
                    {staff.dia_libre && (
                        <div className="text-xs">
                            <div className="text-white/70 mb-1">Día Libre</div>
                            <div className="font-bold text-lg">{staff.dia_libre}</div>
                        </div>
                    )}
                    {staff.horario_salida && (
                        <div className="text-xs">
                            <div className="text-white/70 mb-1">Salida</div>
                            <div className="font-bold text-lg">{staff.horario_salida}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Alerts - Sin Credenciales & No Marcaciones */}
            {(noCredentials.length > 0 || noMarks.length > 0) && (
                <div className="space-y-2">
                    {noCredentials.length > 0 && (
                        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-start gap-3">
                            <Icon name="alert-triangle" size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h3 className="font-bold text-amber-900 mb-1">Sin Credencial</h3>
                                <p className="text-sm text-amber-700">
                                    {noCredentials.length} día(s): {noCredentials.map(n => new Date(n.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })).join(', ')}
                                </p>
                            </div>
                        </div>
                    )}
                    {noMarks.length > 0 && (
                        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3">
                            <Icon name="x-circle" size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h3 className="font-bold text-red-900 mb-1">No Marcación</h3>
                                <p className="text-sm text-red-700">
                                    {noMarks.length} día(s): {noMarks.map(n => new Date(n.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })).join(', ')}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Week Schedule */}
            <div className="bg-white rounded-2xl shadow-lg p-4">
                <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                    <Icon name="calendar" size={20} className="text-indigo-600" />
                    Semana Actual
                </h3>
                <div className="grid grid-cols-7 gap-1">
                    {weekDates.map((date) => {
                        const dayName = new Date(date).toLocaleDateString('es-CL', { weekday: 'short' });
                        const dayNum = new Date(date).getDate();
                        const dayOfWeek = new Date(date).toLocaleDateString('es-CL', { weekday: 'long' });
                        const mark = marks.find(m => m.mark_date === date);
                        const hasLicense = licenses.some(l => date >= l.start_date && date <= l.end_date);
                        const hasPermission = permissions.some(p => date >= p.start_date && date <= p.end_date);
                        const hasDayChange = dayChanges.some(dc => dc.date === date);
                        const isToday = date === new Date().toISOString().split('T')[0];
                        const isFreeDay = staff.dia_libre && dayOfWeek.toLowerCase().includes(staff.dia_libre.toLowerCase());

                        let bgColor = 'bg-slate-100';
                        let textColor = 'text-slate-600';
                        let badge = '';

                        if (isFreeDay) {
                            bgColor = 'bg-indigo-100';
                            textColor = 'text-indigo-700';
                            badge = 'L';
                        } else if (hasLicense) {
                            bgColor = 'bg-purple-100';
                            textColor = 'text-purple-700';
                            badge = 'LIC';
                        } else if (hasPermission) {
                            bgColor = 'bg-orange-100';
                            textColor = 'text-orange-700';
                            badge = 'PER';
                        } else if (hasDayChange) {
                            bgColor = 'bg-blue-100';
                            textColor = 'text-blue-700';
                            badge = 'CD';
                        } else if (mark) {
                            if (mark.mark === 'P') {
                                bgColor = 'bg-green-100';
                                textColor = 'text-green-700';
                                badge = 'P';
                            } else {
                                bgColor = 'bg-red-100';
                                textColor = 'text-red-700';
                                badge = 'A';
                            }
                        }

                        return (
                            <div
                                key={date}
                                className={`${bgColor} ${textColor} rounded-lg p-2 text-center ${isToday ? 'ring-2 ring-indigo-500' : ''}`}
                            >
                                <div className="text-[10px] font-semibold uppercase">{dayName}</div>
                                <div className="text-lg font-black">{dayNum}</div>
                                {badge && <div className="text-[8px] font-bold mt-1">{badge}</div>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Permissions & Day Changes */}
            {(permissions.length > 0 || dayChanges.length > 0) && (
                <div className="space-y-3">
                    {permissions.map((perm) => (
                        <div key={perm.id} className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Icon name="alert-circle" size={18} className="text-orange-600" />
                                <h4 className="font-bold text-orange-900">Permiso</h4>
                            </div>
                            <p className="text-sm text-orange-700">
                                {perm.permission_type} - {new Date(perm.start_date).toLocaleDateString('es-CL')}
                                {perm.start_date !== perm.end_date && ` al ${new Date(perm.end_date).toLocaleDateString('es-CL')}`}
                            </p>
                            {perm.note && <p className="text-xs text-orange-600 mt-1">"{perm.note}"</p>}
                        </div>
                    ))}
                    {dayChanges.map((dc) => (
                        <div key={dc.id} className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Icon name="x" size={18} className="text-blue-600" />
                                <h4 className="font-bold text-blue-900">Cambio de Día</h4>
                            </div>
                            <p className="text-sm text-blue-700">
                                {new Date(dc.date).toLocaleDateString('es-CL')} → {dc.target_date ? new Date(dc.target_date).toLocaleDateString('es-CL') : 'Por definir'}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Legend */}
            <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-600 uppercase mb-3">Leyenda</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-green-100 rounded"></div>
                        <span className="text-slate-700 font-semibold">P: Presente</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-red-100 rounded"></div>
                        <span className="text-slate-700 font-semibold">A: Ausente</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-purple-100 rounded"></div>
                        <span className="text-slate-700 font-semibold">LIC: Licencia</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-orange-100 rounded"></div>
                        <span className="text-slate-700 font-semibold">PER: Permiso</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-blue-100 rounded"></div>
                        <span className="text-slate-700 font-semibold">CD: Cambio Día</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
