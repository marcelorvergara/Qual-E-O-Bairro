/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_EN?: string
  readonly VITE_GA_MEASUREMENT_ID?: string
}

declare module '*.geojson' {
  const value: unknown
  export default value
}
