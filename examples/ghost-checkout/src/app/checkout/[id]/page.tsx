import { Checkout } from '@moneydevkit/ghost'

interface CheckoutPageProps {
  params: Promise<{ id: string }>
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { id } = await params

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Checkout id={id} />
    </main>
  )
}
