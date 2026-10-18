// PostgREST returns at most 1000 rows per request. For totals over a whole table
// (stock value, monthly reports) page through until a short page comes back.
const PAGE = 1000

export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) return { data: out, error }
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return { data: out, error: null }
  }
}
