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

            // Get staff shift assignment
            const { data: staffShift } = await supabase
                .from('staff_shifts')
                .select('*')
                .eq('staff_id', staff.id)
                .order('start_date', { ascending: false })
                .limit(1)
                .single();

            // Get shift type pattern if shift exists
            let shiftType = null;
            if (staffShift) {
                const { data: shiftTypeData } = await supabase
                    .from('shift_types')
                    .select('*')
                    .eq('code', staffShift.shift_type_code)
                    .single();
                shiftType = shiftTypeData;
            }

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
                .or(`and(start_date.lte.${sundayStr},end_date.gte.${mondayStr})`);

            // Get permissions
            const { data: permissions } = await supabase
                .from('attendance_permissions')
                .select('*')
                .eq('staff_id', staff.id)
                .or(`and(start_date.lte.${sundayStr},end_date.gte.${mondayStr})`);

            // Get shift overrides (for early departures, day changes, etc.)
            const { data: overrides } = await supabase
                .from('staff_shift_overrides')
                .select('*')
                .eq('staff_id', staff.id)
                .gte('override_date', mondayStr)
                .lte('override_date', sundayStr);

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
                staffShift,
                shiftType,
                weekDates: dates,
                marks: marks || [],
                licenses: licenses || [],
                permissions: permissions || [],
                overrides: overrides || [],
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

    const { staff, staffShift, shiftType, weekDates, marks, licenses, permissions, overrides, dayChanges, noMarks, noCredentials } = attendanceInfo;

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
                <div className="grid grid-cols-7 gap-2">
                    {weekDates.map((date) => {
                        const dateObj = new Date(date + 'T12:00:00');
                        const dayName = dateObj.toLocaleDateString('es-CL', { weekday: 'short' });
                        const dayNum = dateObj.getDate();
                        const dayOfWeekNum = dateObj.getDay(); // 0=Sunday, 1=Monday, etc.

                        const mark = marks.find(m => m.mark_date === date);
                        const hasLicense = licenses.some(l => date >= l.start_date && date <= l.end_date);
                        const hasPermission = permissions.some(p => date >= p.start_date && date <= p.end_date);
                        const hasDayChange = dayChanges.some(dc => dc.date === date);
                        const isToday = date === new Date().toISOString().split('T')[0];

                        // Check if it's a free day using shift pattern from Asistencia2026
                        let isOff = dayOfWeekNum === 0 || dayOfWeekNum === 6; // Default: weekends
                        if (shiftType?.pattern_json) {
                            if (shiftType.pattern_json.type === 'fixed' && shiftType.pattern_json.offDays) {
                                isOff = shiftType.pattern_json.offDays.includes(dayOfWeekNum);
                            }
                            // TODO: Add support for rotating patterns if needed
                        }

                        // Check for override on this specific date (early departure, day change, etc.)
                        const override = overrides?.find(o => o.override_date === date);
                        let earlyDepartureTime = null;

                        if (override) {
                            // Check override type
                            if (override.override_type === 'OFF') {
                                isOff = true; // Override to make it a free day
                            } else if (override.override_type === 'WORK') {
                                isOff = false; // Override to make it a work day
                            }

                            // Check for early departure in meta_json
                            if (override.meta_json?.early_departure_time) {
                                earlyDepartureTime = override.meta_json.early_departure_time;
                            }
                        }

                        // Parse horario (e.g., "10:00-20:00")
                        const horario = staff.horario || '08:00-17:00';
                        const [startTime, endTime] = horario.split('-');

                        // Use early departure time if available, otherwise use regular end time
                        const displayEndTime = earlyDepartureTime || endTime;

                        return (
                            <div
                                key={date}
                                className={`rounded-xl p-2 border-2 transition-all ${isToday ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white'
                                    }`}
                            >
                                {/* Day name */}
                                <div className="text-[10px] font-bold text-slate-500 text-center uppercase mb-1">
                                    {dayName}
                                </div>

                                {/* Date */}
                                <div className={`text-xl font-black text-center mb-2 ${isToday ? 'text-indigo-600' : 'text-slate-900'
                                    }`}>
                                    {dayNum}
                                </div>

                                {/* Schedule or Status */}
                                {isOff ? (
                                    <div className="bg-emerald-100 text-emerald-700 rounded-lg py-2 text-center font-bold text-base">
                                        L
                                    </div>
                                ) : hasLicense ? (
                                    <div className="bg-purple-100 text-purple-700 rounded-lg py-1 text-center font-bold text-[10px]">
                                        LIC
                                    </div>
                                ) : hasPermission ? (
                                    <div className="bg-orange-100 text-orange-700 rounded-lg py-1 text-center font-bold text-[10px]">
                                        PER
                                    </div>
                                ) : hasDayChange ? (
                                    <div className="bg-blue-100 text-blue-700 rounded-lg py-1 text-center font-bold text-[10px]">
                                        CD
                                    </div>
                                ) : (
                                    <>
                                        {/* Work hours */}
                                        <div className="text-center space-y-0.5">
                                            <div className="text-[11px] font-bold text-slate-900">
                                                {startTime}
                                            </div>
                                            <div className="text-[8px] text-slate-400">-</div>
                                            <div className={`text-[11px] font-bold ${earlyDepartureTime ? 'text-orange-700' : 'text-slate-900'}`}>
                                                {displayEndTime}
                                            </div>
                                        </div>

                                        {/* Early departure indicator */}
                                        {earlyDepartureTime && (
                                            <div className="mt-1 bg-orange-100 text-orange-700 rounded-md py-0.5 px-1 text-[9px] font-bold text-center">
                                                Temprano
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Attendance mark */}
                                {mark && !isOff && (
                                    <div className={`mt-1 rounded-md py-0.5 text-center text-[9px] font-bold ${mark.mark === 'P' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                        {mark.mark === 'P' ? '✓' : '✗'}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

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
                    </div >

    {/* Additional Info */ }
    < div className = "grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/20" >
    {
        staff.dia_libre && (
            <div className="text-xs">
                <div className="text-white/70 mb-1">Día Libre</div>
                <div className="font-bold text-lg">{staff.dia_libre}</div>
            </div>
        )
    }
{
    staff.horario_salida && (
        <div className="text-xs">
            <div className="text-white/70 mb-1">Salida</div>
            <div className="font-bold text-lg">{staff.horario_salida}</div>
        </div>
    )
}
                    </div >
                </div >

    {/* Alerts - Sin Credenciales & No Marcaciones */ }
{
    (noCredentials.length > 0 || noMarks.length > 0) && (
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
    )
}

{/* Week Schedule */ }
<div className="bg-white rounded-2xl shadow-lg p-4">
    <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
        <Icon name="calendar" size={20} className="text-indigo-600" />
        Semana Actual
    </h3>
    <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date) => {
            const dateObj = new Date(date + 'T12:00:00');
            const dayName = dateObj.toLocaleDateString('es-CL', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            const dayOfWeekNum = dateObj.getDay(); // 0=Sunday, 1=Monday, etc.

            const mark = marks.find(m => m.mark_date === date);
            const hasLicense = licenses.some(l => date >= l.start_date && date <= l.end_date);
            const hasPermission = permissions.some(p => date >= p.start_date && date <= p.end_date);
            const hasDayChange = dayChanges.some(dc => dc.date === date);
            const isToday = date === new Date().toISOString().split('T')[0];

            // Check if it's a free day - weekends by default
            let isFreeDay = dayOfWeekNum === 0 || dayOfWeekNum === 6; // Sunday or Saturday

            // Override with staff.dia_libre if specified
            if (staff.dia_libre) {
                const diaLibreLower = staff.dia_libre.toLowerCase();
                const dayNameLower = dateObj.toLocaleDateString('es-CL', { weekday: 'long' }).toLowerCase();
                isFreeDay = dayNameLower.includes(diaLibreLower) || diaLibreLower.includes(dayNameLower);
            }

            // Parse horario (e.g., "10:00-20:00")
            const horario = staff.horario || '08:00-17:00';
            const [startTime, endTime] = horario.split('-');

            // Check for early departure for THIS specific day
            // Note: staff.horario_salida is global, we'd need a per-day override table for this
            // For now, we'll show it on all work days if it exists
            const hasEarlyDeparture = staff.horario_salida && !isFreeDay && !hasLicense && !hasPermission && !hasDayChange;

            return (
                <div
                    key={date}
                    className={`rounded-xl p-2 border-2 transition-all ${isToday ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white'
                        }`}
                >
                    {/* Day name */}
                    <div className="text-[10px] font-bold text-slate-500 text-center uppercase mb-1">
                        {dayName}
                    </div>

                    {/* Date */}
                    <div className={`text-xl font-black text-center mb-2 ${isToday ? 'text-indigo-600' : 'text-slate-900'
                        }`}>
                        {dayNum}
                    </div>

                    {/* Schedule or Status */}
                    {isFreeDay ? (
                        <div className="bg-emerald-100 text-emerald-700 rounded-lg py-2 text-center font-bold text-base">
                            L
                        </div>
                    ) : hasLicense ? (
                        <div className="bg-purple-100 text-purple-700 rounded-lg py-1 text-center font-bold text-[10px]">
                            LIC
                        </div>
                    ) : hasPermission ? (
                        <div className="bg-orange-100 text-orange-700 rounded-lg py-1 text-center font-bold text-[10px]">
                            PER
                        </div>
                    ) : hasDayChange ? (
                        <div className="bg-blue-100 text-blue-700 rounded-lg py-1 text-center font-bold text-[10px]">
                            CD
                        </div>
                    ) : (
                        <>
                            {/* Work hours */}
                            <div className="text-center space-y-0.5">
                                <div className="text-[11px] font-bold text-slate-900">
                                    {startTime}
                                </div>
                                <div className="text-[8px] text-slate-400">-</div>
                                <div className="text-[11px] font-bold text-slate-900">
                                    {hasEarlyDeparture ? staff.horario_salida : endTime}
                                </div>
                            </div>

                            {/* Early departure indicator */}
                            {hasEarlyDeparture && (
                                <div className="mt-1 bg-orange-100 text-orange-700 rounded-md py-0.5 px-1 text-[9px] font-bold text-center">
                                    Temprano
                                </div>
                            )}
                        </>
                    )}

                    {/* Attendance mark */}
                    {mark && !isFreeDay && (
                        <div className={`mt-1 rounded-md py-0.5 text-center text-[9px] font-bold ${mark.mark === 'P' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                            {mark.mark === 'P' ? '✓' : '✗'}
                        </div>
                    )}
                </div>
            );
        })}
    </div>
</div>

{/* Permissions & Day Changes */ }
{
    (permissions.length > 0 || dayChanges.length > 0) && (
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
    )
}

{/* Legend */ }
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
            </div >
            );
};
