import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

async function forward(req: NextRequest): Promise<NextResponse> {
  // The real Supabase path+query is base64-encoded in ?p= query param
  const encoded = req.nextUrl.searchParams.get('p')
  if (!encoded) return NextResponse.json({ error: 'missing p' }, { status: 400 })

  const pathAndQuery = Buffer.from(encoded, 'base64').toString('utf-8')
  const target = `${SUPABASE_URL}${pathAndQuery}`

  // Forward all headers except host and encoding
  const headers = new Headers()
  req.headers.forEach((value, key) => {
    if (key === 'host' || key === 'accept-encoding') return
    headers.set(key, value)
  })

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'

  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error – Node 18 fetch requires duplex for streaming body
      duplex: hasBody ? 'half' : undefined,
    })

    const resHeaders = new Headers()
    response.headers.forEach((value, key) => {
      if (key === 'content-encoding' || key === 'transfer-encoding') return
      resHeaders.set(key, value)
    })

    return new NextResponse(response.body, {
      status: response.status,
      headers: resHeaders,
    })
  } catch (err) {
    console.error('[store] fetch failed:', err)
    return NextResponse.json({ error: 'proxy error' }, { status: 502 })
  }
}

export async function GET(req: NextRequest)     { return forward(req) }
export async function POST(req: NextRequest)    { return forward(req) }
export async function PUT(req: NextRequest)     { return forward(req) }
export async function PATCH(req: NextRequest)   { return forward(req) }
export async function DELETE(req: NextRequest)  { return forward(req) }
export async function OPTIONS(req: NextRequest) { return forward(req) }
