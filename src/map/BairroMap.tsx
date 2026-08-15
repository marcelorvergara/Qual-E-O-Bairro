import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createBairroPaths } from './geometry'
import styles from './BairroMap.module.css'

interface Size {
  width: number
  height: number
}

export function BairroMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [hoveredName, setHoveredName] = useState('')

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = ({ width, height }: Size) => {
      setSize({ width: Math.round(width), height: Math.round(height) })
    }
    update(container.getBoundingClientRect())

    const observer = new ResizeObserver(([entry]) => update(entry.contentRect))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const paths = useMemo(
    () =>
      size.width > 0 && size.height > 0
        ? createBairroPaths(size.width, size.height)
        : [],
    [size],
  )

  return (
    <div className={styles.mapPanel} ref={containerRef}>
      <div className={styles.hoverLabel} aria-live="polite">
        {hoveredName || 'Explore o mapa'}
      </div>
      {size.width > 0 && size.height > 0 && (
        <svg
          className={styles.map}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label="Mapa dos bairros do Rio de Janeiro"
        >
          <g>
            {paths.map(({ feature, path }) => (
              <path
                className={styles.bairro}
                d={path}
                data-cod={feature.properties.codbairro}
                key={feature.properties.codbairro}
                onBlur={() => setHoveredName('')}
                onFocus={() => setHoveredName(feature.properties.nome)}
                onPointerEnter={() => setHoveredName(feature.properties.nome)}
                onPointerLeave={() => setHoveredName('')}
                tabIndex={0}
              />
            ))}
          </g>
        </svg>
      )}
    </div>
  )
}
