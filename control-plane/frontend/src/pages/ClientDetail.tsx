import { useParams } from 'react-router-dom'

export default function ClientDetail() {
  const { clientId } = useParams()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Detalhes do Cliente</h1>
        <p className="text-gray-600 dark:text-gray-400">ID: {clientId}</p>
      </div>

      <div className="card">
        <p className="text-gray-600 dark:text-gray-400">
          Página de detalhes do cliente em desenvolvimento...
        </p>
      </div>
    </div>
  )
}
