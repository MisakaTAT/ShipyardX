import { AppProviders } from '@/app/providers'
import Layout from '@/layouts/root-layout'

export default function App() {
  return (
    <AppProviders>
      <Layout />
    </AppProviders>
  )
}