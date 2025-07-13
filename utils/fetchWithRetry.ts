const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  retries = 3,
  timeout = 5000
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const fetchWithTimeout = async (): Promise<Response> => {
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  for (let i = 0; i < retries; i++) {
    try {
      return await fetchWithTimeout();
    } catch (error) {
      if (i === retries - 1) throw error;
      // Wait 1s, 2s, 4s between retries
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }

  throw new Error('Failed after retries');
};

export default fetchWithRetry;
