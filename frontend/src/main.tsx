import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// Warn if not HTTPS (except localhost)
if (
  typeof window !== 'undefined' &&
  window.location.protocol !== 'https:' &&
  !['localhost', '127.0.0.1'].includes(window.location.hostname)
) {
  console.warn(
    '[Security] This application is not served over HTTPS. Secret keys may be at risk.'
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
