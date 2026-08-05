import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@/providers/theme-provider'
import { router } from '@/router'
import { Component, type ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      retry: 1,
    },
  },
})

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error capturado:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center p-4">
          <div className="glass-panel-strong max-w-md rounded-[28px] border-red-200/60 p-6 dark:border-red-500/20">
            <h2 className="mb-4 text-xl font-bold text-red-600 dark:text-red-400">
              Algo salió mal
            </h2>
            <pre className="mb-4 overflow-auto rounded bg-slate-100 p-3 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              {this.state.error?.message || 'Error desconocido'}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-brand-500 px-4 py-2.5 font-semibold text-white shadow-lg hover:bg-brand-600"
            >
              Recargar página
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
