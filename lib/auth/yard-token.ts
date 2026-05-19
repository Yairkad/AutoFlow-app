export function getYardTenantId(): string | null {
  return process.env.YARD_TENANT_ID ?? null
}
