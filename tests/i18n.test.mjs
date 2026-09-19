import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

async function load(entry) {
  const bundle = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent',
    alias: { '@': './src' } });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

const { APP_LOCALES, DEFAULT_LOCALE, isAppLocale, intlLocale } = await load('src/lib/i18n/config.ts');
const { getDictionary } = await load('src/lib/i18n/get-dictionary.ts');
const { createFormat } = await load('src/lib/ui/format.ts');
const { ERROR_CODES, VALIDATION_CODES } = await load('src/lib/utils/error-codes.ts');
const { errorMessage, issueMessage } = await load('src/lib/i18n/error-message.ts');

// Interpolated copy is a function, so a leaf is described by its type rather
// than its text; two languages agree when every path has the same kind of leaf.
function shape(value, path = '') {
  if (value && typeof value === 'object') return Object.keys(value).sort().flatMap(key => shape(value[key], `${path}.${key}`));
  return [`${path}:${typeof value}`];
}

test('only the supported interface languages are accepted', () => {
  assert.deepEqual([...APP_LOCALES], ['en', 'vi']);
  assert.equal(DEFAULT_LOCALE, 'en');
  assert.equal(isAppLocale('vi'), true);
  for (const value of ['fr', 'EN', '', null, undefined, 1]) assert.equal(isAppLocale(value), false);
  assert.equal(intlLocale('en'), 'en-US');
  assert.equal(intlLocale('vi'), 'vi-VN');
});

test('every language provides the same dictionary entries', () => {
  const english = getDictionary('en');
  for (const locale of APP_LOCALES) {
    const dictionary = getDictionary(locale);
    assert.equal(dictionary.locale, locale);
    // English shows the server's own wording, so it carries no error tables.
    const comparable = ({ errors: { server, validation, ...rest }, ...areas }) => ({ ...areas, errors: rest });
    assert.deepEqual(shape(comparable(dictionary)), shape(comparable(english)), `${locale} matches the English dictionary shape`);
  }
});

test('no entry is left blank and Vietnamese copy is actually translated', () => {
  const blank = [];
  const walk = (value, path) => {
    if (typeof value === 'string') { if (!value.trim()) blank.push(path); }
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
  };
  for (const locale of APP_LOCALES) walk(getDictionary(locale), locale);
  assert.deepEqual(blank, []);
  assert.notEqual(getDictionary('vi').settings.title, getDictionary('en').settings.title);
  assert.equal(getDictionary('vi').settings.currency.saved('JPY').includes('JPY'), true);
});

test('numbers, amounts and dates follow the interface language', () => {
  const english = createFormat('en');
  const vietnamese = createFormat('vi');
  assert.equal(english.number(1234567), '1,234,567');
  assert.equal(vietnamese.number(1234567), '1.234.567');
  assert.equal(english.decimal('1500.50'), '1,500.50');
  assert.equal(vietnamese.decimal('1500.50'), '1.500,50');
  assert.equal(english.money('1500.00', 'usd'), '$1,500.00');
  assert.match(vietnamese.money('1000000', 'VND'), /^1\.000\.000\s₫$/);
  const day = new Date('2026-09-19T00:00:00Z');
  assert.equal(english.day(day), '9/19/2026');
  assert.equal(vietnamese.day(day), '19/9/2026');
  assert.match(vietnamese.longDay(day), /tháng 9/);
  const instant = new Date(2026, 8, 19, 16, 18, 30);
  assert.equal(english.timestamp(instant), instant.toLocaleString('en-US'), 'English timestamps read as they did before translation');
  assert.equal(vietnamese.timestamp(instant), instant.toLocaleString('vi-VN'));
  assert.equal(english.dateTime(instant), instant.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
});

test('amounts keep every digit and unusable input is shown as received', () => {
  const english = createFormat('en');
  assert.equal(english.decimal('90071992547409.91'), '90,071,992,547,409.91');
  assert.equal(english.decimal('12345678901234567890.12'), '12,345,678,901,234,567,890.12');
  assert.equal(english.decimal('not a number'), 'not a number');
  assert.equal(english.money('10.00', 'dollars'), '10.00');
});

test('every error and validation code is translated outside English', () => {
  assert.equal(getDictionary('en').errors.server, null);
  const { server, validation } = getDictionary('vi').errors;
  assert.deepEqual(Object.keys(server).sort(), [...ERROR_CODES].sort());
  assert.deepEqual(Object.keys(validation).sort(), [...VALIDATION_CODES].sort());
  assert.equal(new Set(ERROR_CODES).size, ERROR_CODES.length, 'codes are unique');
});

test('failures are shown in the interface language and fall back to the server wording', () => {
  const failure = (status, message, code) => Object.assign(new Error(message), { status, code });
  const english = getDictionary('en');
  const vietnamese = getDictionary('vi');
  const conflict = failure(409, 'The role is assigned to an account', 'ROLE_ASSIGNED');
  assert.equal(errorMessage(conflict, english), 'The role is assigned to an account');
  assert.equal(errorMessage(conflict, vietnamese), vietnamese.errors.server.ROLE_ASSIGNED);
  assert.equal(errorMessage(failure(400, 'Newer server wording', 'NOT_YET_KNOWN'), vietnamese), 'Newer server wording');
  assert.equal(errorMessage(failure(500, 'Request failed (500)'), vietnamese), vietnamese.errors.unexpected);
  assert.equal(errorMessage(failure(500, 'Request failed (500)'), english), 'Request failed (500)');
  assert.equal(errorMessage(new TypeError('Failed to fetch'), vietnamese), vietnamese.errors.unreachable);
  assert.equal(errorMessage(new TypeError('Failed to fetch'), english), english.errors.unreachable);
  const issue = { path: ['subject'], message: 'A task needs a subject', code: 'TASK_NEEDS_SUBJECT' };
  assert.equal(issueMessage(issue, english), 'A task needs a subject');
  assert.equal(issueMessage(issue, vietnamese), vietnamese.errors.validation.TASK_NEEDS_SUBJECT);
  assert.equal(issueMessage({ message: 'Unusual', code: 'not_in_table' }, vietnamese), 'Unusual');
});
