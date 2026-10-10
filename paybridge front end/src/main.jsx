import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import { Toaster } from 'sonner';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <Toaster 
        position="top-right" 
        richColors 
        closeButton
        theme="dark"
        toastOptions={{
          style: {
            background: '#0f172a',
            border: '1px solid #1e293b',
            color: '#f8fafc',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          },
        }}
      />
      <App />
    </AppProvider>
  </React.StrictMode>
);
