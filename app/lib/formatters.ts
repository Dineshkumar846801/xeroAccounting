export function money(value: string | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value ?? 0));
}

export function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
        new Date(`${value}T00:00:00`)
      )
    : "—";
}
