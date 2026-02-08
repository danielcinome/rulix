/**
 * Terminal formatting: ANSI colors, symbols, output helpers.
 * Respects NO_COLOR env and non-TTY output.
 */

const useColor =
	process.env.NO_COLOR === undefined &&
	!process.argv.includes("--no-color") &&
	process.stdout.isTTY === true;

function wrap(code: string, text: string): string {
	return useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const color = {
	green: (s: string): string => wrap("32", s),
	red: (s: string): string => wrap("31", s),
	yellow: (s: string): string => wrap("33", s),
	blue: (s: string): string => wrap("34", s),
	cyan: (s: string): string => wrap("36", s),
	dim: (s: string): string => wrap("2", s),
	bold: (s: string): string => wrap("1", s),
};

export const sym = {
	ok: color.green("✔"),
	fail: color.red("✗"),
	warn: color.yellow("⚠"),
	dot: "•",
};

export function log(msg: string): void {
	console.log(msg);
}

export function blank(): void {
	console.log();
}

export function success(msg: string): void {
	console.log(`  ${sym.ok} ${msg}`);
}

export function fail(msg: string): void {
	console.error(`  ${sym.fail} ${msg}`);
}

export function warning(msg: string): void {
	console.log(`  ${sym.warn} ${msg}`);
}

export function info(msg: string): void {
	console.log(`  ${sym.dot} ${msg}`);
}

export function header(msg: string): void {
	console.log(`\n  ${color.bold(msg)}\n`);
}
