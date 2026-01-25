/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_API_URL: string
  readonly VITE_BACKEND_URL: string
  readonly VITE_GOOGLE_MAPS_API_KEY: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'react-window';
declare module 'react-dom/client';

