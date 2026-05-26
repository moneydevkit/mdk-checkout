'use client'

import { useEffect, useMemo, useRef } from 'react'
import { QRCodeStyling } from '@liquid-js/qr-code-styling'
import { useMdkTheme, type MdkTheme } from '../providers'

// MDK teal gradient stops per theme.
// Dark: Phosphor Teal -> Deep Signal Teal (bright on black).
// Light: deeper teal pair so the modules retain AA contrast against white.
const THEMED_STOPS: Record<MdkTheme, [string, string]> = {
  dark: ['oklch(0.88 0.17 175)', 'oklch(0.74 0.18 178)'],
  light: ['oklch(0.55 0.18 175)', 'oklch(0.42 0.18 178)'],
}

const THEMED_BG: Record<MdkTheme, string> = {
  dark: '#000000',
  light: '#ffffff',
}

export interface StyledQRCodeProps {
  value: string
  size?: number
  /** Overrides the theme-derived background color. */
  bgColor?: string
}

// StyledQRCode renders a Money Dev Kit-branded QR via @liquid-js/qr-code-styling.
// Small-square dots with a 45deg MDK teal gradient. Background and gradient flip
// with the surrounding MdkCheckoutProvider's theme; pass bgColor to override.
export function StyledQRCode({ value, size = 240, bgColor }: StyledQRCodeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const qrRef = useRef<QRCodeStyling | null>(null)
  const theme = useMdkTheme()

  const effectiveBg = bgColor ?? THEMED_BG[theme]

  const gradient = useMemo(() => {
    const [stop0, stop1] = THEMED_STOPS[theme]
    return {
      type: 'linear' as const,
      rotation: Math.PI / 4,
      colorStops: [
        { offset: 0, color: stop0 },
        { offset: 1, color: stop1 },
      ],
    }
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return

    qrRef.current = new QRCodeStyling({
      size,
      data: value,
      dotsOptions: {
        type: 'small-square',
        gradient,
      },
      cornersSquareOptions: {
        type: 'square',
        gradient,
      },
      cornersDotOptions: {
        type: 'square',
        gradient,
      },
      backgroundOptions: {
        color: effectiveBg,
      },
    })

    if (containerRef.current) {
      containerRef.current.innerHTML = ''
      qrRef.current.append(containerRef.current)
    }
    // mount-only init; subsequent prop / theme changes flow through .update() below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    qrRef.current?.update({
      size,
      data: value,
      dotsOptions: { gradient },
      cornersSquareOptions: { gradient },
      cornersDotOptions: { gradient },
      backgroundOptions: { color: effectiveBg },
    })
  }, [value, size, effectiveBg, gradient])

  return (
    <div
      ref={containerRef}
      className="mdk-styled-qr"
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    />
  )
}

export default StyledQRCode
