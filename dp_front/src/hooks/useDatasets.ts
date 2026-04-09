import { useQuery } from '@tanstack/react-query';
import { getDatasets } from '../api/client';

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: getDatasets,
  });
}
