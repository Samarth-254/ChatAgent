import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSessions, deleteSession, renameSession } from '../api/sessionsApi.js';

export function useSessions() {
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['memory-timeline'] });
    }
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }) => renameSession(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    }
  });

  return {
    sessions: sessionsQuery.data || [],
    isLoading: sessionsQuery.isLoading,
    refetch: sessionsQuery.refetch,
    deleteSession: deleteMutation.mutate,
    renameSession: renameMutation.mutate
  };
}

