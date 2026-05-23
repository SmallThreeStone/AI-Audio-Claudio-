import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-radio-bg)]">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-[var(--color-radio-accent)] rounded-full flex items-center justify-center mx-auto">
              <span className="text-white text-xl">!</span>
            </div>
            <h2 className="text-lg font-semibold">出错了</h2>
            <p className="text-sm text-[var(--color-radio-muted)]">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[var(--color-radio-accent)] text-white text-sm rounded-lg"
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
