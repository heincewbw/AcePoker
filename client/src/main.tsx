import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

// Sync Zustand persisted token to localStorage key used by api.ts
try {
  const persisted = localStorage.getItem('acepoker-auth');
  if (persisted) {
    const { state } = JSON.parse(persisted);
    if (state?.token) localStorage.setItem('token', state.token);
  }
} catch { /* ignore */ }

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#1a0a0a',
              color: '#fff',
              border: '1px solid #c9a227',
            },
            success: { iconTheme: { primary: '#c9a227', secondary: '#1a0a0a' } },
            error: { iconTheme: { primary: '#cc0000', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
