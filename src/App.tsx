import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import { AuthScreen } from './features/auth/AuthScreen'
import { HomeScreen } from './features/home/HomeScreen'

function Root() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center bg-base" />
  }

  return (
    <Routes>
      <Route path="/auth" element={session ? <Navigate to="/chat" replace /> : <AuthScreen />} />
      <Route path="/*" element={session ? <HomeScreen /> : <Navigate to="/auth" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
