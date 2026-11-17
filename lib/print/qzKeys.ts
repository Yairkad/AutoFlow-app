// Server-only: the business's QZ Tray signing key (table qz_keys, service role only).
// Created on first use: RSA-2048 + a self-signed certificate valid for 20 years.
import { generateKeyPairSync } from 'crypto'
import forge from 'node-forge'
import { createServiceClient } from '@/lib/supabase/service'

export interface QzKey { certificate: string; private_key: string }

export async function getQzKey(tenantId: string): Promise<QzKey> {
  const sb = createServiceClient()
  const { data, error } = await sb.from('qz_keys').select('certificate, private_key').eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return data as QzKey

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const cert = forge.pki.createCertificate()
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey)
  cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8))
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600_000)
  cert.validity.notAfter = new Date(Date.now() + 20 * 365 * 24 * 3600_000)
  const attrs = [{ name: 'commonName', value: 'AutoFlow labels' }, { name: 'organizationName', value: 'AutoFlow' }]
  cert.setSubject(attrs); cert.setIssuer(attrs)
  cert.setExtensions([{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', digitalSignature: true, keyCertSign: true }])
  cert.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create())
  const row = { tenant_id: tenantId, certificate: forge.pki.certificateToPem(cert), private_key: privateKey }

  // Another request may have created it meanwhile — keep whichever landed first.
  const { error: insErr } = await sb.from('qz_keys').insert(row)
  if (insErr) {
    const { data: again } = await sb.from('qz_keys').select('certificate, private_key').eq('tenant_id', tenantId).maybeSingle()
    if (again) return again as QzKey
    throw new Error(insErr.message)
  }
  return { certificate: row.certificate, private_key: row.private_key }
}
