import AppShell from '@/components/layout/AppShell'
import ExpensesClient from '@/components/expenses/ExpensesClient'

export default function ExpensesPage() {
  return <AppShell><ExpensesClient defaultTab="expenses" /></AppShell>
}
