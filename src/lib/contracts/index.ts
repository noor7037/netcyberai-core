// Contracts between the Core lane and the Experience lane (docs/16 §4a,
// Decision Log C110). Types and small pure helpers only; no I/O. Owned by
// Core; the Experience lane consumes them and asks for changes in its PR.
export * from './modules';
export * from './entitlements';
export * from './navigation';
export * from './settings';
export * from './filters';
export * from './bulk';
export * from './student-search';
export * from './charts';
export * from './fixture';
