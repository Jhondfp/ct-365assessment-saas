import { useEffect, useState, useCallback } from 'react'
import { apiClient } from '@/services/api'
import type { User } from '@/types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true)
        const data = await apiClient.getMe()
        setUser(data)
        setError(null)
      } catch (err) {
        setUser(null)
        // Não é erro se não autenticado — é esperado
        if (err instanceof Error && !err.message.includes('401')) {
          setError(err.message)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiClient.logout()
      setUser(null)
    } catch (err) {
      console.error('Logout error:', err)
    }
  }, [])

  const login = useCallback(() => {
    apiClient.login()
  }, [])

  return {
    user,
    loading,
    error,
    logout,
    login,
    isAuthenticated: !!user
  }
}
