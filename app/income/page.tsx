import AppShell from '@/components/layout/AppShell'
import ExpensesClient from '@/components/expenses/ExpensesClient'

export default function IncomePage() {
  return <AppShell><ExpensesClient defaultTab="income" /></AppShell>
}
