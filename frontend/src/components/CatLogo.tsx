import { useState, useCallback } from 'react'
import CatMiniAvatar from './CatMiniAvatar'
import { huajiaoTheme, lanmaoTheme, heimaotaxueTheme } from '../data/themes'
import { niannianColors } from '../data/cats/niannian'
import { xiaohuColors } from '../data/cats/xiaohu'
import { pixelColors } from '../data/cats/pixel'
import { huangjinColors } from '../data/cats/huangjin'
import { mimiColors } from '../data/cats/mimi'
import { xiaobaiColors } from '../data/cats/xiaobai'
import { fafaColors } from '../data/cats/fafa'

const CAT_PALETTE = [
  huajiaoTheme,
  lanmaoTheme,
  heimaotaxueTheme,
  niannianColors,
  xiaohuColors,
  pixelColors,
  huangjinColors,
  mimiColors,
  xiaobaiColors,
  fafaColors,
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
