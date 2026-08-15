import { geoMercator, geoPath } from 'd3-geo'
import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
} from 'geojson'
import bairrosJson from '../../data/bairros.geojson'

export interface BairroProperties {
  codbairro: string
  nome: string
  rp: string
  regiao_adm: string
}

const source = bairrosJson as FeatureCollection<Geometry, BairroProperties>

function orientForD3(geometry: Geometry): Geometry {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) => [...ring].reverse()),
    } satisfies Polygon
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => [...ring].reverse()),
      ),
    } satisfies MultiPolygon
  }
  return geometry
}

// D3's spherical polygons use the opposite ring winding from RFC 7946 GeoJSON.
export const bairros: FeatureCollection<Geometry, BairroProperties> = {
  ...source,
  features: source.features.map((feature) => ({
    ...feature,
    geometry: orientForD3(feature.geometry),
  })),
}

export function createBairroPaths(width: number, height: number) {
  const padding = Math.max(8, Math.min(width, height) * 0.025)
  const projection = geoMercator().fitExtent(
    [
      [padding, padding],
      [width - padding, height - padding],
    ],
    bairros,
  )
  const path = geoPath(projection)

  return bairros.features.map((feature) => ({
    feature: feature as Feature<Geometry, BairroProperties>,
    path: path(feature) ?? '',
    centroid: path.centroid(feature) as [number, number],
    bounds: path.bounds(feature) as [[number, number], [number, number]],
  }))
}
