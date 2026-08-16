/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_EN?: string
}

declare module '*.geojson' {
  const value: unknown
  export default value
}
