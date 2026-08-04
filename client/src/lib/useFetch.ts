import { useCallback, useEffect, useState } from 'react';
import api from './api';
import { apiError } from './api';

export function useFetch<T = any>(url: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await api.get(url);
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(apiError(e, 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { refetch(); /* eslint-disable-next-line */ }, [refetch, ...deps]);

  return { data, loading, error, refetch, setData };
}
