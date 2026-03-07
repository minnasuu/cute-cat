import { useRef, useEffect, useState, useCallback } from "react"
import CatSVG from "../../components/CatSVG"
import { assistants } from "../../data/cats"

const pickRandom = (msgs: string[]) => msgs[Math.floor(Math.random() * msgs.length)]

export const LandHeroCtas = () => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [bubble, setBubble] = useState<Record<string, string>>({})
  const speedRef = useRef(0.5)
  const isDraggingRef = useRef(false)
  const lastXRef = useRef(0)
  const momentumRef = useRef(0)
  const rafRef = useRef<number>(0)

  const cats = assistants.slice(0, 10)
  const allCats = [...cats, ...cats, ...cats]

  const animate = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const singleSetWidth = track.scrollWidth / 3

    if (!isDraggingRef.current) {
      if (Math.abs(momentumRef.current) > 0.1) {
        track.scrollLeft += momentumRef.current
        momentumRef.current *= 0.95
      } else {
        track.scrollLeft += speedRef.current
        momentumRef.current = 0
      }
    }

    if (track.scrollLeft >= singleSetWidth * 2) {
      track.scrollLeft -= singleSetWidth
    } else if (track.scrollLeft <= 0) {
      track.scrollLeft += singleSetWidth
    }

    rafRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    track.scrollLeft = track.scrollWidth / 3
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [animate])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true
    lastXRef.current = e.clientX
    momentumRef.current = 0
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !trackRef.current) return
    const dx = lastXRef.current - e.clientX
    trackRef.current.scrollLeft += dx
    momentumRef.current = dx * 0.3
    lastXRef.current = e.clientX
  }, [])

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!trackRef.current) return
    e.preventDefault()
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    momentumRef.current = delta * 0.5
  }, [])

  const handleMouseEnter = useCallback((key: string, messages: string[]) => {
    setHoveredId(key)
    setBubble(prev => ({ ...prev, [key]: pickRandom(messages) }))
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null)
  }, [])

  return (
    <div className="w-full overflow-hidden select-none" style={{ cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}>
      <div
        ref={trackRef}
        className="cat-scroll-track flex gap-12 overflow-x-scroll pb-12 px-2 items-end"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        {allCats.map((cat, i) => {
          const key = `${cat.id}-${i}`
          const isHovered = hoveredId === key
          return (
            <div
              key={key}
              className={`flex-shrink-0 relative ${isHovered ? 'cat-wag-tail' : ''}`}
              style={{ paddingTop: 40 }}
              onMouseEnter={() => handleMouseEnter(key, cat.messages)}
              onMouseLeave={handleMouseLeave}
            >
              {isHovered && bubble[key] && (
                <div
                  className="cat-bubble absolute left-1/2 pointer-events-none"
                  style={{
                    top: 0,
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                    background: 'white',
                    border: '1.5px solid #e5e7eb',
                    borderRadius: 12,
                    padding: '4px 12px',
                    fontSize: 12,
                    color: '#374151',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    zIndex: 10,
                  }}
                >
                  {bubble[key]}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -6,
                      left: '50%',
                      transform: 'translateX(-50%) rotate(45deg)',
                      width: 10,
                      height: 10,
                      background: 'white',
                      borderRight: '1.5px solid #e5e7eb',
                      borderBottom: '1.5px solid #e5e7eb',
                    }}
                  />
                </div>
              )}
              <CatSVG colors={cat.catColors} size={200} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
