import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './assets/styles/globals.css';

// Di NATIVE (Capacitor): hapus service worker + cache lama bila ada. Build APK
// sebelumnya sempat mendaftarkan SW yang menyebabkan layar blank (stuck di
// splash) karena cache basi. Capacitor menyajikan aset secara lokal sendiri,
// jadi SW memang tidak diperlukan di app. Aman dijalankan tiap kali.
if (Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((r) => void r.unregister()))
    .catch(() => {});
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k))).catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
