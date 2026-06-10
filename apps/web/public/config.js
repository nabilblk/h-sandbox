// Runtime configuration for the Harakiri dashboard.
//
// In a container this file is OVERWRITTEN at startup from environment variables
// (see apps/web/docker-entrypoint.d/40-harakiri-runtime-config.sh), so one image
// works in any environment. The empty default below is used for local `vite`
// dev, where config comes from Vite env instead.
window.__HARAKIRI_CONFIG__ = window.__HARAKIRI_CONFIG__ || {};
