/**
 * Lightweight token estimation without external dependencies.
 *
 * Uses a character-based heuristic (~4 chars per token) that's accurate
 * enough for budget warnings. Exact counting via tiktoken is planned for v0.2.
 */

const CHARS_PER_TOKEN = 4;

/** Estimates token count using the ~4 chars/token heuristic for English/code. */
export function estimateTokens(text: string): number {
	if (text.length === 0) return 0;
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Builds the full text that a rule contributes to a tool's context window:
 * frontmatter metadata + markdown content.
 */
export function estimateRuleTokens(
	content: string,
	description: string,
): number {
	return estimateTokens(`${description}\n${content}`);
}

/** Sums estimated tokens across multiple content strings. */
export function sumTokens(tokenCounts: number[]): number {
	let total = 0;
	for (const count of tokenCounts) {
		total += count;
	}
	return total;
}

export interface TokenBudgetUsage {
	readonly used: number;
	readonly max: number;
	readonly percentage: number;
	readonly exceeded: boolean;
}

/** Computes usage against a budget, returning percentage and exceeded flag. */
export function computeBudgetUsage(
	used: number,
	max: number,
): TokenBudgetUsage {
	const percentage = max === 0 ? 100 : (used / max) * 100;
	return {
		used,
		max,
		percentage,
		exceeded: used > max,
	};
}
