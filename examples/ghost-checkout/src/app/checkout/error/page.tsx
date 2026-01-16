interface ErrorPageProps {
  searchParams: Promise<{ error?: string; message?: string }>
}

export default async function ErrorPage({ searchParams }: ErrorPageProps) {
  const { error, message } = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-red-500 text-5xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {error === 'invalid_signature' ? 'Invalid Checkout Link' : 'Checkout Error'}
        </h1>
        <p className="text-gray-600 mb-6">
          {message || 'Something went wrong with your checkout link.'}
        </p>
        <p className="text-sm text-gray-500">
          Please request a new payment link from the site.
        </p>
      </div>
    </main>
  )
}
