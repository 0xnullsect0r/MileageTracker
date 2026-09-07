// Dev scripts run outside Next's bundler, where the real `server-only`
// package throws on import. Mapped in scripts/tsconfig.json so the guard
// stays in place for the app build.
export {};
