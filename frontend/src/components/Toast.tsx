import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

type ToastType = 'error' | 'success' | 'info' | 'warning'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export const useToast = () => useContext(ToastContext)

// Singleton reference for use outside React components (e.g. apiClient)
let _globalToast: ((message: string, type?: ToastType) => void) | null = null
export const showToast = (message: string, type: ToastType = 'error') => {
  _globalToast?.(message, type)
}

const TOAST_DURATION = 4000

const ICONS: Record<ToastType, string> = {
  error: '✕',
  success: '✓',
  info: 'ℹ',
  warning: '⚠',
}

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  error:   { bg: 'bg-danger-50',    border: 'border-red-200',    text: 'text-danger-700',    icon: 'bg-danger-500' },
  success: { bg: 'bg-green-50',     border: 'border-green-200',     text: 'text-green-700',     icon: 'bg-green-500' },
  info:    { bg: 'bg-blue-50',      border: 'border-blue-200',      text: 'text-blue-700',      icon: 'bg-blue-500' },
  warning: { bg: 'bg-yellow-50',    border: 'border-yellow-200',    text: 'text-yellow-700',    icon: 'bg-yellow-500' },
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const addToast = useCallback((message: string, type: ToastType = 'error') => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, TOAST_DURATION)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Register global reference
  useEffect(() => {
    _globalToast = addToast
    return () => { _globalToast = null }
  }, [addToast])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-sm w-full">
        {toasts.map(t => {
          const c = COLORS[t.type]
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border ${c.bg} ${c.border} animate-toast-in`}
            >
              <span className={`w-5 h-5 rounded-full ${c.icon} text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
                {ICONS[t.type]}
              </span>
              <p className={`text-sm font-medium flex-1 ${c.text}`}>{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                className={`text-sm opacity-50 hover:opacity-100 transition-opacity flex-shrink-0 ${c.text}`}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
