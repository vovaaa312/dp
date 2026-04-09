import { useQuery } from '@tanstack/react-query';
import { getJobs } from '../api/client';

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: getJobs,
    refetchInterval: 5000,
  });
}
