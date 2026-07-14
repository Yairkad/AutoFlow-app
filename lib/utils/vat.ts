export const VAT_RATE = 0.18
export const withVat = (n: number) => n * (1 + VAT_RATE)
export const withoutVat = (n: number) => n / (1 + VAT_RATE)
