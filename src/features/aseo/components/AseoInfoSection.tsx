import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../../shared/components/common/Icon';
import { supabase } from '../../../shared/lib/supabaseClient';
import {
    isOffDay,
    getSpecialShiftDetails,
    getFallbackShiftType,
    getLocalTodayStr
} from '../../asistencia2026/utils/shiftEngine';
import { StaffShiftSpecialTemplate, StaffShiftOverride } from '../../asistencia2026/types';

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

            // Get staff shift assignment from Asistencia2026
            const { data: staffShift } = await supabase
                .from('staff_shifts')
                .select('*')
                .eq('staff_id', staff.id)
                .order('start_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            // Get shift type pattern if shift exists
            let shiftType = null;
            if (staffShift) {
                const { data: shiftTypeData } = await supabase
                    .from('shift_types')
                    .select('*')
                    .eq('code', staffShift.shift_type_code)
                    .maybeSingle();
                shiftType = shiftTypeData;
            }

            // Get special template if any (for manual config)
            const { data: specialTemplate } = await supabase
                .from('staff_shift_special_templates')
                .select('*')
                .eq('staff_id', staff.id)
                .maybeSingle();

            // Get current week dates
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 is Sunday
            // Calculate Monday
            const monday = new Date(now);
            const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // adjust when day is sunday
            monday.setDate(now.getDate() - diff);

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

            // Get shift overrides
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
                specialTemplate: specialTemplate as StaffShiftSpecialTemplate | null,
                weekDates: dates,
                marks: marks || [],
                licenses: licenses || [],
                permissions: permissions || [],
                overrides: (overrides || []) as StaffShiftOverride[],
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

    const {
        staff,
        staffShift,
        shiftType,
        specialTemplate,
        weekDates,
        marks,
        licenses,
        permissions,
        overrides,
        dayChanges,
        noMarks,
        noCredentials
    } = attendanceInfo;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Icon name="calendar" size={100} />
                </div>
                <h2 className="text-xl font-bold mb-1 opacity-90">Mi Horario</h2>
                <h1 className="text-2xl font-black mb-3">{staff.nombre}</h1>
                <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full font-bold flex items-center">
                        <Icon name="briefcase" size={12} className="mr-1.5" />
                        {staff.cargo}
                    </span>
                    <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full font-bold flex items-center">
                        <Icon name="map-pin" size={12} className="mr-1.5" />
                        {staff.terminal_code}
                    </span>
                    <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full font-bold flex items-center">
                        <Icon name="clock" size={12} className="mr-1.5" />
                        {staff.horario || 'Sin horario'}
                    </span>
                </div>
            </div>

            {/* Alerts */}
            {(noCredentials.length > 0 || noMarks.length > 0) && (
                <div className="space-y-2">
                    {noCredentials.length > 0 && (
                        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-xl p-3 flex items-start gap-3 shadow-sm">
                            <Icon name="alert-triangle" size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h3 className="font-bold text-amber-900 text-sm">Sin Credencial</h3>
                                <p className="text-xs text-amber-700 mt-0.5">
                                    {noCredentials.length} día(s): {noCredentials.map((n: any) => new Date(n.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'numeric' })).join(', ')}
                                </p>
                            </div>
                        </div>
                    )}
                    {noMarks.length > 0 && (
                        <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-3 flex items-start gap-3 shadow-sm">
                            <Icon name="x-circle" size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h3 className="font-bold text-red-900 text-sm">No Marcación</h3>
                                <p className="text-xs text-red-700 mt-0.5">
                                    {noMarks.length} día(s): {noMarks.map((n: any) => new Date(n.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'numeric' })).join(', ')}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Week Schedule Week View */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Icon name="calendar" size={20} className="text-indigo-600" />
                        Semana Actual
                    </h3>
                    <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                        {new Date(weekDates[0]).toLocaleDateString('es-CL', { day: 'numeric' })} - {new Date(weekDates[6]).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                    </span>
                </div>

                <div className="space-y-2">
                    {weekDates.map((date) => {
                        const dateObj = new Date(date + 'T12:00:00');
                        const dayName = dateObj.toLocaleDateString('es-CL', { weekday: 'long' });
                        const dayNum = dateObj.getDate();
                        const isToday = date === getLocalTodayStr();

                        const mark = marks.find((m: any) => m.mark_date === date);
                        const hasLicense = licenses.some((l: any) => date >= l.start_date && date <= l.end_date);
                        const hasPermission = permissions.some((p: any) => date >= p.start_date && date <= p.end_date);
                        const hasDayChange = dayChanges.some((dc: any) => dc.date === date);

                        // CALCULATE STATUS USING CENTRAL LOGIC
                        let isOff = false;
                        let specialDetails = null;

                        if (staffShift) {
                            let effectiveShiftType = shiftType;
                            // Use fallback if pattern json is missing but we have a code
                            if (!effectiveShiftType?.pattern_json) {
                                effectiveShiftType = getFallbackShiftType(staffShift.shift_type_code);
                            }

                            if (effectiveShiftType?.pattern_json) {
                                const overrideFound = overrides.find(o => o.override_date === date);

                                isOff = isOffDay(
                                    date,
                                    staffShift.shift_type_code,
                                    staffShift.variant_code || undefined,
                                    effectiveShiftType.pattern_json,
                                    specialTemplate,
                                    overrideFound
                                );

                                if (specialTemplate) {
                                    specialDetails = getSpecialShiftDetails(date, specialTemplate);
                                }
                            } else {
                                // Fallback basic logic
                                const d = new Date(date + 'T12:00:00').getDay();
                                isOff = d === 0 || d === 6;
                            }
                        }

                        // Determine display time
                        const horario = staff.horario || '08:00-17:00';
                        const [defaultStart, defaultEnd] = horario.split('-');
                        let displayStart = defaultStart;
                        let displayEnd = defaultEnd;

                        // Apply Early Exit if exists for this day (and it's not an off day)
                        if (!isOff && specialDetails?.earlyExit) {
                            displayEnd = specialDetails.earlyExit;
                        }

                        return (
                            <div
                                key={date}
                                className={`flex items-center p-3 rounded-xl border transition-all ${isToday
                                        ? 'border-indigo-500 bg-indigo-50/50 shadow-md ring-1 ring-indigo-200'
                                        : 'border-slate-100 hover:border-slate-200 bg-white'
                                    }`}
                            >
                                {/* Date Column */}
                                <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg mr-3 ${isToday ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                    <span className="text-[10px] font-bold uppercase leading-none mb-0.5">{dayName.substring(0, 3)}</span>
                                    <span className="text-xl font-bold leading-none">{dayNum}</span>
                                </div>

                                {/* Status Column */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className={`text-sm font-bold capitalize ${isToday ? 'text-indigo-900' : 'text-slate-700'}`}>
                                            {dayName}
                                        </h4>
                                        {isToday && (
                                            <span className="text-[10px] font-bold bg-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded">HOY</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {isOff ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">
                                                LIN: Libre
                                            </span>
                                        ) : hasLicense ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700">
                                                Licencia Médica
                                            </span>
                                        ) : hasPermission ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-700">
                                                Permiso
                                            </span>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-slate-600 flex items-center">
                                                    <Icon name="clock" size={12} className="mr-1 text-slate-400" />
                                                    {displayStart} - {displayEnd}
                                                </span>
                                                {specialDetails?.earlyExit && (
                                                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                                                        Salida Temprana
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Mark Status */}
                                <div className="ml-2">
                                    {mark && !isOff ? (
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${mark.mark === 'P' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                            }`}>
                                            <Icon name={mark.mark === 'P' ? 'check' : 'x'} size={16} strokeWidth={3} />
                                        </div>
                                    ) : (
                                        !isOff && !hasLicense && !hasPermission && isToday && (
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                                                <Icon name="minus" size={16} />
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Permissions & Day Changes */}
            {(permissions.length > 0 || dayChanges.length > 0) && (
                <div className="space-y-3">
                    {permissions.map((perm: any) => (
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
                </div>
            )}
        </div>
    );
};
