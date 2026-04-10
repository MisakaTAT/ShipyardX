import { ThemeProvider } from '@/components/theme-provider'
import { STORAGE_KEY } from '@/components/theme-provider'
import Layout from './layouts/Layout'

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={STORAGE_KEY}
    >
      <Layout />
    </ThemeProvider>
  )
}
