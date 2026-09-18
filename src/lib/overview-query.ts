import { currencyCode } from "./utils/validation";

/** The URL parameter wins; the workspace's stored reporting currency is the fallback. */
export function parseOverviewCurrency(search: string, stored: string): string {
  const params = new URLSearchParams(search);
  if (params.getAll("currency").length > 1) throw new Error("Choose one currency for the overview.");
  return params.has("currency") ? currencyCode.parse(params.get("currency")) : stored;
}

/** Currency selection leaves record navigation and unrelated list state intact. */
export function overviewCurrencyUrl(current: string, currency: string): string {
  const url = new URL(current, "http://localhost");
  url.searchParams.set("currency", currencyCode.parse(currency));
  return `${url.pathname}${url.search}${url.hash}`;
}
