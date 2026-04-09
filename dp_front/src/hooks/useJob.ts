import { useQuery } from '@tanstack/react-query';
import { getJob } from '../api/client';
import type { Job } from '../types';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'STOPPED']);

export function useJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as Job | undefined;
      if (!data) return 3000;
      return TERMINAL_STATUSES.has(data.status) ? false : 3000;
    },
  });
}
