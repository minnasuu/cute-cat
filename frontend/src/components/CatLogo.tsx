import { useState, useCallback } from 'react'
import CatMiniAvatar from './CatMiniAvatar'
import { lihuajiabaiTheme, lanmaoTheme, heimaotaxueTheme, jubaiColors, sanhuaColors, xianluoColors, goldenxianluoColors, baimaoColors, milkColors, meiduanColors } from '../data/themes'

const CAT_PALETTE = [
  lihuajiabaiTheme,
  lanmaoTheme,
  heimaotaxueTheme,
  jubaiColors,
  sanhuaColors,
  xianluoColors,
  goldenxianluoColors,
  baimaoColors,
  milkColors,
  meiduanColors,
]

interface CatLogoProps {
  size?: number
  className?: string
}

const CatLogo: React.FC<CatLogoProps> = ({ size = 48, className }) => {
  const [colorIndex, setColorIndex] = useState(0)

  const handleMouseEnter = useCallback(() => {
    setColorIndex(prev => {
      let next: number
      do {
        next = Math.floor(Math.random() * CAT_PALETTE.length)
      } while (next === prev && CAT_PALETTE.length > 1)
      return next
    })
  }, [])

  return (
    <div
      onMouseEnter={handleMouseEnter}
      className={className}
      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <CatMiniAvatar
        colors={CAT_PALETTE[colorIndex]}
        size={size}
      />
    </div>
  )
}

export default CatLogo
