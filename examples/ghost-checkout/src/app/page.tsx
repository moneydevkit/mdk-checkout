export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Ghost Checkout
        </h1>
        <p className="text-gray-600 mb-6">
          This is a MoneyDevKit checkout server for Ghost blogs.
        </p>
        <p className="text-sm text-gray-500">
          Payments are handled via signed checkout URLs from your Ghost site.
        </p>
      </div>
    </main>
  )
}
