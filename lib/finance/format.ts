const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatRupees(paise: number): string {
  return rupees.format(paise / 100);
}

export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  const percent = rate * 100;
  const digits = Math.abs(percent) >= 100 ? 0 : 1;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(percent);
  return `${formatted}%`;
}
