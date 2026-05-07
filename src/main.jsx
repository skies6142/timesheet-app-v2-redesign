import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lib/storage'; // initialises window.storage
import './index.css';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import App from './App';

// Register service worker and cache the registration globally
// so showTimerNotification can use it immediately without waiting
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((reg) => {
      window.__swReg = reg;
      // If the SW is still installing, wait for it to activate
      if (reg.installing) {
        reg.installing.addEventListener('statechange', (e) => {
          if (e.target.state === 'activated') window.__swReg = reg;
        });
      }
    })
    .catch((err) => console.warn('[SW] registration failed:', err));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </AuthProvider>
  </StrictMode>
);
