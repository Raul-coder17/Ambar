import { AuthProvider, useAuth } from './features/auth/AuthContext'
import { AuthScreen } from './features/auth/AuthScreen'
import { HomeScreen } from './features/home/HomeScreen'

function Gate() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center bg-slate-950" />
  }

  return session ? <HomeScreen /> : <AuthScreen />
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

export default App
