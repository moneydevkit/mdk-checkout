import type { Metadata } from 'next'
import '@moneydevkit/nextjs/mdk-styles.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ghost Checkout',
  description: 'Lightning payments for Ghost memberships',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
