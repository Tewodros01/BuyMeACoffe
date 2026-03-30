import { Spinner } from '../components/ui'
import AppRouter from '../app/router/AppRouter'
import { useBootstrapSession } from '../app/useBootstrapSession'

const App = () => {
  const authReady = useBootstrapSession()

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070f]">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return <AppRouter />
}

export default App
