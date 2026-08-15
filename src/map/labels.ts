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

export function layoutLabels(candidates: LabelCandidate[]): PlacedLabel[] {
  const placed: PlacedLabel[] = []

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
    if (chosen) placed.push(chosen)
  }

  return placed
}
