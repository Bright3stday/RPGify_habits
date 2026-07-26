// PWA installability: registers the service worker (sw.js) that makes the
// app installable + minimally offline-capable in a plain browser (iOS Safari
// "Add to Home Screen", Android Chrome's install prompt, desktop).
//
// Deliberately never runs inside the native Capacitor build — a second
// service worker in that WebView could shadow content that
// @capgo/capacitor-updater has already swapped in via OTA.

function isNativeShell() {
  const c = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return !!(c && c.isNativePlatform && c.isNativePlatform());
}

export async function registerServiceWorker() {
  if (isNativeShell()) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    console.warn('service worker registration failed', e);
  }
}

// True when running installed to the home screen / standalone window, rather
// than a normal browser tab (iOS Safari has no matchMedia support for this,
// hence the navigator.standalone fallback).
export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}
