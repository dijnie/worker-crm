import { intlLocale, type AppLocale } from "@/lib/i18n/config";

const WELL_FORMED_CURRENCY_CODE = /^[A-Za-z]{3}$/;
const DECIMAL_STRING = /^-?\d+(?:\.\d+)?$/;

export interface AppFormat {
	/** A whole or fractional number with the language's grouping. */
	number(value: number): string;
	/** An exact decimal string from the API; its fraction digits are preserved. */
	decimal(value: string): string;
	/** An exact decimal string as an amount in the given ISO 4217 currency. */
	money(value: string, currency: string): string;
	/** A calendar day stored as UTC, without a time. */
	day(date: Date): string;
	/** A day written out with its weekday, for group headings. */
	longDay(date: Date): string;
	/** A compact date and time, for timestamps in lists. */
	dateTime(date: Date): string;
	/** A numeric date with the time to the second, as `toLocaleString()` writes it. */
	timestamp(date: Date): string;
}

function fractionLength(value: string): number {
	const point = value.indexOf(".");
	return point === -1 ? 0 : value.length - point - 1;
}

export function createFormat(locale: AppLocale): AppFormat {
	const tag = intlLocale(locale);
	const numberFormat = new Intl.NumberFormat(tag);
	const dayFormat = new Intl.DateTimeFormat(tag, { timeZone: "UTC" });
	const longDayFormat = new Intl.DateTimeFormat(tag, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
	const dateTimeFormat = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });
	const timestampFormat = new Intl.DateTimeFormat(tag, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });

	// Amounts arrive as exact decimal strings. Intl formats a numeric string
	// without converting it to a double, so large values keep every digit.
	function exact(value: string, options: Intl.NumberFormatOptions): string {
		if (!DECIMAL_STRING.test(value)) return value;
		const digits = Math.min(fractionLength(value), 20);
		return new Intl.NumberFormat(tag, { ...options, minimumFractionDigits: digits, maximumFractionDigits: digits })
			.format(value as Intl.StringNumericLiteral);
	}

	return {
		number: value => numberFormat.format(value),
		decimal: value => exact(value, {}),
		money: (value, currency) => WELL_FORMED_CURRENCY_CODE.test(currency)
			? exact(value, { style: "currency", currency: currency.toUpperCase() })
			: exact(value, {}),
		day: date => dayFormat.format(date),
		longDay: date => longDayFormat.format(date),
		dateTime: date => dateTimeFormat.format(date),
		timestamp: date => timestampFormat.format(date),
	};
}

export function initialsFromName(name: string | null | undefined): string {
	const parts = (name ?? "").split(/\s+/).filter(Boolean);
	const first = parts[0];
	if (!first) return "?";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	const last = parts[parts.length - 1] ?? first;
	return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}
