/**
 * Asistencia 2026 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { TerminalContext } from '../../shared/types/terminal';
import { resolveTerminalsForContext } from '../../shared/utils/terminal';
import {
    fetchShiftTypes,
    fetchStaffWithShifts,
    fetchStaffShift,
    upsertStaffShift,
    fetchSpecialTemplate,
    fetchAllSpecialTemplates,
    upsertSpecialTemplate,
    fetchOverridesForMonth,
    fetchMarksForMonth,
    createOrUpdateMark,
    bulkMarkPresent,
    fetchLicensesForMonth,
    createLicense,
    fetchPermissionsForMonth,
    createPermission,
    fetchVacationsForMonth,
    fetchIncidencesForMonth,
    createOffboardingRequest,
    subscribeToAsistencia2026Changes,
} from './api/asistencia2026Api';
import {
    GridFilters,
    StaffShiftFormValues,
    AttendanceMarkFormValues,
    AttendanceLicenseFormValues,
    AttendancePermissionFormValues,
    OffboardingRequestFormValues,
    SpecialTemplateSettings,
} from './types';

// ==========================================
// QUERY KEYS
// ==========================================

export const asistencia2026Keys = {
    all: ['asistencia2026'] as const,
    shiftTypes: () => [...asistencia2026Keys.all, 'shiftTypes'] as const,
    staff: () => [...asistencia2026Keys.all, 'staff'] as const,
    staffList: (terminalContext: TerminalContext, filters?: GridFilters) =>
        [...asistencia2026Keys.staff(), terminalContext, filters] as const,
    staffShift: (staffId: string) => [...asistencia2026Keys.all, 'staffShift', staffId] as const,
    specialTemplate: (staffId: string) => [...asistencia2026Keys.all, 'specialTemplate', staffId] as const,
    monthData: () => [...asistencia2026Keys.all, 'monthData'] as const,
    overrides: (staffIds: string[], year: number, month: number) =>
        [...asistencia2026Keys.monthData(), 'overrides', staffIds.join(','), year, month] as const,
    marks: (staffIds: string[], year: number, month: number) =>
        [...asistencia2026Keys.monthData(), 'marks', staffIds.join(','), year, month] as const,
    licenses: (staffIds: string[], year: number, month: number) =>
        [...asistencia2026Keys.monthData(), 'licenses', staffIds.join(','), year, month] as const,
    permissions: (staffIds: string[], year: number, month: number) =>
        [...asistencia2026Keys.monthData(), 'permissions', staffIds.join(','), year, month] as const,
    vacations: (staffIds: string[], year: number, month: number) =>
        [...asistencia2026Keys.monthData(), 'vacations', staffIds.join(','), year, month] as const,
    incidences: (terminals: string[], year: number, month: number) =>
        [...asistencia2026Keys.monthData(), 'incidences', terminals.join(','), year, month] as const,
};

// ==========================================
// QUERIES
// ==========================================

export const useShiftTypes = () => {
    return useQuery({
        queryKey: asistencia2026Keys.shiftTypes(),
        queryFn: fetchShiftTypes,
    });
};

export const useStaffWithShifts = (terminalContext: TerminalContext, filters?: GridFilters) => {
    return useQuery({
        queryKey: asistencia2026Keys.staffList(terminalContext, filters),
        queryFn: () => fetchStaffWithShifts(terminalContext, filters),
    });
};

export const useStaffShift = (staffId: string | null) => {
    return useQuery({
        queryKey: asistencia2026Keys.staffShift(staffId || ''),
        queryFn: () => staffId ? fetchStaffShift(staffId) : null,
        enabled: Boolean(staffId),
    });
};

export const useSpecialTemplate = (staffId: string | null) => {
    return useQuery({
        queryKey: asistencia2026Keys.specialTemplate(staffId || ''),
        queryFn: () => staffId ? fetchSpecialTemplate(staffId) : null,
        enabled: Boolean(staffId),
    });
};

export const useAllSpecialTemplates = (staffIds: string[]) => {
    return useQuery({
        queryKey: ['asistencia2026', 'specialTemplates', 'all', staffIds.join(',')],
        queryFn: () => fetchAllSpecialTemplates(staffIds),
        enabled: staffIds.length > 0,
    });
};

export const useOverridesForMonth = (staffIds: string[], year: number, month: number) => {
    return useQuery({
        queryKey: asistencia2026Keys.overrides(staffIds, year, month),
        queryFn: () => fetchOverridesForMonth(staffIds, year, month),
        enabled: staffIds.length > 0,
    });
};

export const useMarksForMonth = (staffIds: string[], year: number, month: number) => {
    return useQuery({
        queryKey: asistencia2026Keys.marks(staffIds, year, month),
        queryFn: () => fetchMarksForMonth(staffIds, year, month),
        enabled: staffIds.length > 0,
    });
};

export const useLicensesForMonth = (staffIds: string[], year: number, month: number) => {
    return useQuery({
        queryKey: asistencia2026Keys.licenses(staffIds, year, month),
        queryFn: () => fetchLicensesForMonth(staffIds, year, month),
        enabled: staffIds.length > 0,
    });
};

export const usePermissionsForMonth = (staffIds: string[], year: number, month: number) => {
    return useQuery({
        queryKey: asistencia2026Keys.permissions(staffIds, year, month),
        queryFn: () => fetchPermissionsForMonth(staffIds, year, month),
        enabled: staffIds.length > 0,
    });
};

export const useVacationsForMonth = (staffIds: string[], year: number, month: number) => {
    return useQuery({
        queryKey: asistencia2026Keys.vacations(staffIds, year, month),
        queryFn: () => fetchVacationsForMonth(staffIds, year, month),
        enabled: staffIds.length > 0,
    });
};

export const useIncidencesForMonth = (terminalContext: TerminalContext, year: number, month: number) => {
    const terminals = resolveTerminalsForContext(terminalContext);

    return useQuery({
        queryKey: asistencia2026Keys.incidences(terminals, year, month),
        queryFn: () => fetchIncidencesForMonth(terminals, year, month),
    });
};

// ==========================================
// MUTATIONS
// ==========================================

export const useUpsertStaffShift = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (values: StaffShiftFormValues) => upsertStaffShift(values),
        onSuccess: (data) => {
            console.log('useUpsertStaffShift - Invalidating queries for staff_id:', data.staff_id);
            // Invalidate all asistencia2026 queries to refresh all data
            queryClient.invalidateQueries({ queryKey: asistencia2026Keys.all });
        },
    });
};

export const useUpsertSpecialTemplate = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ staffId, offDays, settings }: { staffId: string; offDays: number[]; settings?: SpecialTemplateSettings }) =>
            upsertSpecialTemplate(staffId, offDays, settings),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: asistencia2026Keys.specialTemplate(data.staff_id) });
        },
    });
};

export const useCreateOrUpdateMark = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ values, createdBy }: { values: AttendanceMarkFormValues; createdBy: string }) =>
            createOrUpdateMark(values, createdBy),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: asistencia2026Keys.monthData() });
        },
    });
};

export const useCreateLicense = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ values, createdBy }: { values: AttendanceLicenseFormValues; createdBy: string }) =>
            createLicense(values, createdBy),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: asistencia2026Keys.monthData() });
        },
    });
};

export const useCreatePermission = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ values, createdBy }: { values: AttendancePermissionFormValues; createdBy: string }) =>
            createPermission(values, createdBy),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: asistencia2026Keys.monthData() });
        },
    });
};

export const useCreateOffboardingRequest = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ values, requestedBy }: { values: OffboardingRequestFormValues; requestedBy: string }) =>
            createOffboardingRequest(values, requestedBy),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: asistencia2026Keys.staff() });
        },
    });
};

export const useBulkMarkPresent = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ staffIds, date, createdBy }: { staffIds: string[]; date: string; createdBy: string }) =>
            bulkMarkPresent(staffIds, date, createdBy),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: asistencia2026Keys.monthData() });
        },
    });
};

// ==========================================
// REALTIME SUBSCRIPTION HOOK
// ==========================================

export const useAsistencia2026Realtime = () => {
    const queryClient = useQueryClient();

    useEffect(() => {
        const unsubscribe = subscribeToAsistencia2026Changes(
            () => {
                console.log('Attendance marks changed');
                queryClient.invalidateQueries({ queryKey: asistencia2026Keys.monthData() });
            },
            () => {
                console.log('Licenses changed');
                queryClient.invalidateQueries({ queryKey: asistencia2026Keys.monthData() });
            },
            () => {
                console.log('Permissions changed');
                queryClient.invalidateQueries({ queryKey: asistencia2026Keys.monthData() });
            }
        );

        return unsubscribe;
    }, [queryClient]);
};
