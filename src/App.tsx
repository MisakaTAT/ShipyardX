import { ThemeProvider } from '@/components/theme-provider'
import { STORAGE_KEY } from '@/components/theme-provider'
import Layout from './layouts/Layout'

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey={STORAGE_KEY}>
      <Layout />
    </ThemeProvider>
  )
}
