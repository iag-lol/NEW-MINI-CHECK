import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as aseoApi from './api/aseoApi';
import type { CreateAseoRecordInput } from './types';

// ==========================================
// CLEANERS
// ==========================================

export function useRegisterCleaner() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (name: string) => aseoApi.registerCleaner(name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['aseo-cleaners'] });
        }
    });
}

export function useFetchCleanerByName(name: string | null) {
    return useQuery({
        queryKey: ['aseo-cleaner', name],
        queryFn: () => name ? aseoApi.fetchCleanerByName(name) : null,
        enabled: !!name
    });
}

// ==========================================
// RECORDS
// ==========================================

export function useCreateAseoRecord() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ cleanerId, cleanerName, input, photo }: {
            cleanerId: string;
            cleanerName: string;
            input: CreateAseoRecordInput;
            photo: File;
        }) => aseoApi.createAseoRecord(cleanerId, cleanerName, input, photo),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['aseo-records'] });
            queryClient.invalidateQueries({ queryKey: ['aseo-stats'] });
        }
    });
}

export function useFetchAseoRecords(cleanerId?: string) {
    return useQuery({
        queryKey: ['aseo-records', cleanerId],
        queryFn: () => aseoApi.fetchAseoRecords(cleanerId)
    });
}

// ==========================================
// TASKS
// ==========================================

export function useFetchTasks(cleanerId: string | undefined) {
    return useQuery({
        queryKey: ['aseo-tasks', cleanerId],
        queryFn: () => cleanerId ? aseoApi.fetchTasks(cleanerId) : [],
        enabled: !!cleanerId
    });
}

export function useUpdateTaskStatus() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, status, evidenceFile }: {
            taskId: string;
            status: 'PENDIENTE' | 'TERMINADA';
            evidenceFile?: File;
        }) => aseoApi.updateTaskStatus(taskId, status, evidenceFile),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['aseo-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['aseo', 'all-tasks'] });
        }
    });
}

export function useFetchAllTasks() {
    return useQuery({
        queryKey: ['aseo', 'all-tasks'],
        queryFn: () => aseoApi.fetchAllTasks()
    });
}

export function useCreateTask() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ cleanerId, title, description, createdBy }: {
            cleanerId: string;
            title: string;
            description: string;
            createdBy: string;
        }) => aseoApi.createTask(cleanerId, title, description, createdBy),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['aseo-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['aseo-notifications'] });
        }
    });
}

// ==========================================
// NOTIFICATIONS
// ==========================================

export function useFetchNotifications(cleanerId: string | undefined) {
    return useQuery({
        queryKey: ['aseo-notifications', cleanerId],
        queryFn: () => cleanerId ? aseoApi.fetchNotifications(cleanerId) : [],
        enabled: !!cleanerId,
        refetchInterval: 10000 // Poll every 10 seconds
    });
}

export function useMarkNotificationRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (notificationId: string) => aseoApi.markNotificationRead(notificationId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['aseo-notifications'] });
        }
    });
}

// ==========================================
// ADMIN / STATS
// ==========================================

export function useFetchAllCleaners() {
    return useQuery({
        queryKey: ['aseo-cleaners'],
        queryFn: () => aseoApi.fetchAllCleaners()
    });
}

export function useFetchAseoStats() {
    return useQuery({
        queryKey: ['aseo-stats'],
        queryFn: () => aseoApi.fetchAseoStats(),
        refetchInterval: 30000 // Refresh every 30 seconds
    });
}
