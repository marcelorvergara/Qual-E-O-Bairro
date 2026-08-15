export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface LabelCandidate {
  cod: string
  anchor: [number, number]
  bounds: [[number, number], [number, number]]
  width: number
  height: number
}

export interface PlacedLabel extends LabelCandidate {
  x: number
  y: number
  rect: Rect
  leader?: { x1: number; y1: number; x2: number; y2: number }
}

interface LayoutArea {
  width: number
  height: number
  margin?: number
}

const directions: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
]

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  )
}

function rectangle(x: number, y: number, width: number, height: number): Rect {
  return {
    left: x - width / 2,
    top: y - height / 2,
    right: x + width / 2,
    bottom: y + height / 2,
  }
}

export function layoutLabels(
  candidates: LabelCandidate[],
  area?: LayoutArea,
): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const margin = area?.margin ?? 4
  const inside = (rect: Rect) =>
    !area ||
    (rect.left >= margin &&
      rect.top >= margin &&
      rect.right <= area.width - margin &&
      rect.bottom <= area.height - margin)

  for (const candidate of candidates) {
    const [anchorX, anchorY] = candidate.anchor
    const centered = rectangle(
      anchorX,
      anchorY,
      candidate.width,
      candidate.height,
    )
    const bairroWidth = candidate.bounds[1][0] - candidate.bounds[0][0]
    if (
      bairroWidth >= candidate.width &&
      inside(centered) &&
      !placed.some(({ rect }) => rectsOverlap(rect, centered))
    ) {
      placed.push({ ...candidate, x: anchorX, y: anchorY, rect: centered })
      continue
    }

    let chosen: PlacedLabel | undefined
    for (const [dx, dy] of directions) {
      const x = anchorX + dx * (candidate.width / 2 + 8)
      const y = anchorY + dy * (candidate.height / 2 + 8)
      const rect = rectangle(x, y, candidate.width, candidate.height)
      if (!inside(rect)) continue
      chosen = {
        ...candidate,
        x,
        y,
        rect,
        leader: {
          x1: anchorX,
          y1: anchorY,
          x2: x - dx * (candidate.width / 2),
          y2: y - dy * (candidate.height / 2),
        },
      }
      if (!placed.some((label) => rectsOverlap(label.rect, rect))) break
    }
    if (!chosen && area) {
      const x = Math.min(
        area.width - margin - candidate.width / 2,
        Math.max(margin + candidate.width / 2, anchorX),
      )
      const y = Math.min(
        area.height - margin - candidate.height / 2,
        Math.max(margin + candidate.height / 2, anchorY),
      )
      chosen = {
        ...candidate,
        x,
        y,
        rect: rectangle(x, y, candidate.width, candidate.height),
      }
    }
    if (chosen) placed.push(chosen)
  }

  return placed
}
