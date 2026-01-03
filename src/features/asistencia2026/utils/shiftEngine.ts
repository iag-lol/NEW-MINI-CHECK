/**
 * Shift Engine - Core logic for calculating work/off days
 * Based on shift type patterns
 */

import {
    ShiftTypeCode,
    VariantCode,
    ShiftPattern,
    StaffShiftSpecialTemplate,
    StaffShiftOverride,
    ShiftType,
} from '../types';

/**
 * Fallback shift patterns when DB doesn't have shift_types data
 */
export function getFallbackShiftType(code: ShiftTypeCode): ShiftType | undefined {
    const fallbacks: Record<ShiftTypeCode, ShiftType> = {
        '5X2_FIJO': {
            id: '1',
            code: '5X2_FIJO',
            name: '5x2 Fijo',
            pattern_json: { type: 'fixed', description: 'Lun-Vie trabaja', offDays: [6, 0] },
            created_at: '',
        },
        '5X2_ROTATIVO': {
            id: '2',
            code: '5X2_ROTATIVO',
            name: '5x2 Rotativo',
            pattern_json: {
                type: 'rotating',
                description: 'Rotativo 2 semanas',
                cycle: 2,
                weeks: [{ offDays: [3, 0] }, { offDays: [5, 6] }],
            },
            created_at: '',
        },
        '5X2_SUPER': {
            id: '3',
            code: '5X2_SUPER',
            name: '5x2 Super',
            pattern_json: {
                type: 'rotating',
                description: 'Super 2 semanas',
                cycle: 2,
                weeks: [{ offDays: [3, 0] }, { offDays: [4, 5] }],
            },
            created_at: '',
        },
        'ESPECIAL': {
            id: '4',
            code: 'ESPECIAL',
            name: 'Especial',
            pattern_json: { type: 'manual', description: 'Manual 28 dias', cycleDays: 28 },
            created_at: '',
        },
        'SUPERVISOR_RELEVO': {
            id: '5',
            code: 'SUPERVISOR_RELEVO',
            name: 'Supervisor Relevo',
            pattern_json: {
                type: 'rotating',
                description: 'Sem1: Mié+Dom (2 libres), Sem2: Mié+Vie+Sáb (3 libres)',
                cycle: 2,
                weeks: [{ offDays: [3, 0] }, { offDays: [3, 5, 6] }],
            },
            created_at: '',
        },
    };
    return fallbacks[code];
}

// Reference date for cycle calculations - Monday Dec 29, 2025 at noon (to avoid TZ issues)
// Week 1 (Dec 29 - Jan 4): Cycle index 0
// Week 2 (Jan 5 - Jan 11): Cycle index 1
const CYCLE_REFERENCE_DATE = new Date(Date.UTC(2025, 11, 29, 12, 0, 0)); // Dec 29, 2025 12:00 UTC

/**
 * Get the number of days between two dates (using UTC to avoid TZ issues)
 */
export function daysBetween(date1: Date, date2: Date): number {
    const utc1 = Date.UTC(date1.getUTCFullYear(), date1.getUTCMonth(), date1.getUTCDate());
    const utc2 = Date.UTC(date2.getUTCFullYear(), date2.getUTCMonth(), date2.getUTCDate());
    return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

/**
 * Parse a date string (YYYY-MM-DD) to UTC noon to avoid TZ issues
 */
export function parseDateToUTC(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/**
 * Get the week number in cycle (0-indexed)
 */
export function getWeekInCycle(date: Date, cycleWeeks: number): number {
    const days = daysBetween(CYCLE_REFERENCE_DATE, date);
    const weeks = Math.floor(days / 7);
    return ((weeks % cycleWeeks) + cycleWeeks) % cycleWeeks; // Handle negative modulo
}

/**
 * Get day of week from UTC date (0 = Sunday, 6 = Saturday)
 */
export function getDayOfWeekUTC(date: Date): number {
    return date.getUTCDay();
}

/**
 * Check if a date string is within a range
 */
export function isDateInRange(date: string, startDate: string, endDate: string): boolean {
    return date >= startDate && date <= endDate;
}

/**
 * Calculate if a specific date is an OFF day for a shift type
 */
export function isOffDay(
    dateStr: string,
    shiftTypeCode: ShiftTypeCode,
    variantCode: VariantCode,
    pattern: ShiftPattern,
    specialTemplate?: StaffShiftSpecialTemplate,
    override?: StaffShiftOverride
): boolean {
    // Check for override first
    if (override) {
        return override.override_type === 'OFF';
    }

    // Parse date to UTC to avoid timezone issues
    const date = parseDateToUTC(dateStr);
    const dayOfWeek = getDayOfWeekUTC(date);

    switch (pattern.type) {
        case 'fixed': {
            // 5x2 FIJO: Saturday (6) and Sunday (0) are off
            return pattern.offDays?.includes(dayOfWeek) ?? false;
        }

        case 'rotating': {
            // 5x2 ROTATIVO or 5x2 SUPER with week-based cycle
            if (!pattern.weeks || !pattern.cycle) return false;

            let weekIndex = getWeekInCycle(date, pattern.cycle);

            // For CONTRATURNO variant, invert the week index
            if (variantCode === 'CONTRATURNO') {
                weekIndex = (weekIndex + 1) % pattern.cycle;
            }

            const weekPattern = pattern.weeks[weekIndex];
            const isOff = weekPattern?.offDays?.includes(dayOfWeek) ?? false;

            return isOff;
        }

        case 'manual': {
            // ESPECIAL: Use 28-day template
            if (!specialTemplate || !pattern.cycleDays) return false;

            const days = daysBetween(CYCLE_REFERENCE_DATE, date);
            const dayInCycle = ((days % pattern.cycleDays) + pattern.cycleDays) % pattern.cycleDays;

            return specialTemplate.off_days_json.includes(dayInCycle);
        }

        default:
            return false;
    }
}

/**
 * Get special shift details (Day/Night, Early Exit) from template settings
 */
export function getSpecialShiftDetails(
    dateStr: string,
    specialTemplate?: StaffShiftSpecialTemplate
): { type: 'DIA' | 'NOCHE'; earlyExit?: string } {
    if (!specialTemplate?.settings_json) return { type: 'DIA' };

    const date = parseDateToUTC(dateStr);

    // Check Daily D/N
    const days = daysBetween(CYCLE_REFERENCE_DATE, date);
    const dayInCycle = ((days % 28) + 28) % 28; // Assume 28 for manual

    const dailyType = specialTemplate.settings_json.daily_shifts?.[dayInCycle] || 'DIA';

    // Check Early Exit
    let earlyExit: string | undefined;
    const dayOfWeek = getDayOfWeekUTC(date); // 0=Sun, 6=Sat

    if (specialTemplate.settings_json.early_exit?.enabled) {
        const settings = specialTemplate.settings_json.early_exit;
        // Check new 'days' array or fallback to legacy 'day_of_week'
        const isEarlyExitDay = settings.days
            ? settings.days.includes(dayOfWeek)
            : settings.day_of_week === dayOfWeek;

        if (isEarlyExitDay) {
            earlyExit = settings.time;
        }
    }

    return { type: dailyType, earlyExit };
}

/**
 * Determine if turno is DIA or NOCHE based on horario string
 */
export function getTurnoFromHorario(horario: string): 'DIA' | 'NOCHE' {
    if (!horario) return 'DIA';

    const upper = horario.toUpperCase();
    if (upper.includes('NOCHE') || upper.includes('NIGHT')) return 'NOCHE';

    // Parse start time from horario (e.g., "10:00-20:00" or "22:00-06:00")
    const match = horario.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return 'DIA';

    const startHour = parseInt(match[1], 10);

    // Night shift typically starts at 20:00 or later, or before 06:00
    if (startHour >= 20 || startHour < 6) {
        return 'NOCHE';
    }

    return 'DIA';
}

/**
 * Get days in a month
 */
export function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * Generate array of dates for a month
 */
export function getMonthDates(year: number, month: number): string[] {
    const daysInMonth = getDaysInMonth(year, month);
    const dates: string[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        dates.push(date.toISOString().split('T')[0]);
    }

    return dates;
}

/**
 * Format date to display day number
 */
export function formatDayNumber(dateStr: string): number {
    return new Date(dateStr + 'T12:00:00').getDate();
}

/**
 * Format date to display day of week abbreviation
 */
export function formatDayOfWeek(dateStr: string): string {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const date = new Date(dateStr + 'T12:00:00');
    return dayNames[date.getDay()];
}

/**
 * Get generic local date YYYY-MM-DD
 */
export function getLocalTodayStr(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Check if a date is today (Local Time)
 */
export function isToday(dateStr: string): boolean {
    return dateStr === getLocalTodayStr();
}

/**
 * Check if a date is in the past (Local Time)
 */
export function isPastDate(dateStr: string): boolean {
    return dateStr < getLocalTodayStr();
}

/**
 * Get month name in Spanish
 */
export function getMonthName(month: number): string {
    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return months[month];
}

/**
 * Calculate day in 28-day cycle for special templates
 */
export function getDayInCycle(dateStr: string, cycleDays: number = 28): number {
    const date = new Date(dateStr + 'T12:00:00');
    const days = daysBetween(CYCLE_REFERENCE_DATE, date);
    return ((days % cycleDays) + cycleDays) % cycleDays;
}

/**
 * Get the Monday of the week containing the given date
 */
export function getWeekStart(dateStr: string): string {
    const date = new Date(dateStr + 'T12:00:00');
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(date.setDate(diff));
    return monday.toISOString().split('T')[0];
}

/**
 * Get array of 7 dates for a week starting from Monday
 */
export function getWeekDates(weekStartDate: string): string[] {
    const dates: string[] = [];
    const start = new Date(weekStartDate + 'T12:00:00');

    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }

    return dates;
}

/**
 * Get previous week's Monday
 */
export function getPreviousWeek(weekStartDate: string): string {
    const date = new Date(weekStartDate + 'T12:00:00');
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
}

/**
 * Get next week's Monday
 */
export function getNextWeek(weekStartDate: string): string {
    const date = new Date(weekStartDate + 'T12:00:00');
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
}

/**
 * Format week range for display (e.g., "30 Dic - 5 Ene 2026")
 */
export function formatWeekRange(weekStartDate: string): string {
    const dates = getWeekDates(weekStartDate);
    const start = new Date(dates[0] + 'T12:00:00');
    const end = new Date(dates[6] + 'T12:00:00');

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const startDay = start.getDate();
    const startMonth = monthNames[start.getMonth()];
    const endDay = end.getDate();
    const endMonth = monthNames[end.getMonth()];
    const year = end.getFullYear();

    if (start.getMonth() === end.getMonth()) {
        return `${startDay} - ${endDay} ${startMonth} ${year}`;
    }

    return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
}

/**
 * Determine the specific shift (DIA/NOCHE) for a staff member on a specific date.
 * Consolidates logic from hooks and components.
 */
export function determineDailyShift(
    horario: string | undefined,
    shift: { shift_type_code: ShiftTypeCode; name?: string } | undefined, // Extended shift info
    date: string,
    specialTemplates: StaffShiftSpecialTemplate[],
    staffId: string,
    shiftTypes: ShiftType[] // Needed for name lookup
): 'DIA' | 'NOCHE' {
    // 1. Check Horario (Time/String) - Strong Signal
    const isNightByHorario = getTurnoFromHorario(horario || '') === 'NOCHE';

    // 2. Check Global Shift Name/Code
    let isNightByName = false;
    if (shift) {
        const globalShiftDef = shiftTypes.find(t => t.code === shift.shift_type_code);
        const nameUpper = (globalShiftDef?.name || shift.name || '').toUpperCase();
        const codeUpper = (shift.shift_type_code || '').toUpperCase();
        if (nameUpper.includes('NOCHE') || codeUpper.includes('NOCHE')) {
            isNightByName = true;
        }
    }

    // 3. Check Special Manual Shift Override
    let isNightByTemplate = false;
    if (shift?.shift_type_code === 'ESPECIAL') {
        const specialTemplateFound = specialTemplates.find(t => t.staff_id === staffId);
        if (specialTemplateFound) {
            const details = getSpecialShiftDetails(date, specialTemplateFound);
            if (details.type === 'NOCHE') {
                isNightByTemplate = true;
            }
        }
    }

    // If ANY signal indicates Night, it's Night.
    if (isNightByHorario || isNightByName || isNightByTemplate) {
        return 'NOCHE';
    }

    return 'DIA';
}

// Removed Ley 40 automatic reduction logic as per user request.
// Now relying solely on Manual/Special Shift Templates for early exits.
