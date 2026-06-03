import { type ReactNode } from 'react'
import Header from './Header'

export default function Layout({ children, onLogin }: { children: ReactNode; onLogin?: () => void }) {
  return (
    <div className="min-h-screen flex flex-col radio-bg safe-area-inset">
      <Header onLogin={onLogin} />
      {children}
    </div>
  )
}
