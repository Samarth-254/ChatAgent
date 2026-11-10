import { useQuery } from '@tanstack/react-query';
import { request } from '../../../lib/http.js';

export function useMemoryTimeline() {
  const query = useQuery({
    queryKey: ['memory-timeline'],
    queryFn: () => request('/api/v1/memory/timeline')
  });

  return {
    timeline: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch
  };
}

