/*
 * Runtime configuration.
 *
 * Vite bakes VITE_* variables into the bundle at build time, which means
 * changing the API URL normally needs a rebuild. This file is served
 * as-is and read before the app starts, so a deployed site can be
 * pointed at a different backend by editing one line — no rebuild.
 *
 * Leave apiBaseUrl empty to fall back to the build-time VITE_API_BASE_URL.
 */
window.__ESG_CONFIG__ = {
  apiBaseUrl: '',
}
