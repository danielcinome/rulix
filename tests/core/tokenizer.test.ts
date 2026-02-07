import { describe, expect, it } from "vitest";
import {
	computeBudgetUsage,
	estimateRuleTokens,
	estimateTokens,
	sumTokens,
} from "../../src/core/tokenizer.js";

describe("estimateTokens", () => {
	it("returns 0 for empty string", () => {
		expect(estimateTokens("")).toBe(0);
	});

	it("estimates ~4 chars per token", () => {
		expect(estimateTokens("abcd")).toBe(1);
		expect(estimateTokens("abcde")).toBe(2);
		expect(estimateTokens("abcdefgh")).toBe(2);
	});

	it("rounds up partial tokens", () => {
		expect(estimateTokens("a")).toBe(1);
		expect(estimateTokens("ab")).toBe(1);
		expect(estimateTokens("abc")).toBe(1);
	});

	it("handles multiline content", () => {
		const content = "line one\nline two\nline three";
		expect(estimateTokens(content)).toBe(Math.ceil(content.length / 4));
	});

	it("handles unicode characters", () => {
		const emoji = "🎉🎉🎉🎉";
		expect(estimateTokens(emoji)).toBeGreaterThan(0);
	});
});

describe("estimateRuleTokens", () => {
	it("combines description and content with newline separator", () => {
		const description = "Test rule";
		const content = "# Rule\n\n- Do this";
		const combined = `${description}\n${content}`;
		expect(estimateRuleTokens(content, description)).toBe(
			Math.ceil(combined.length / 4),
		);
	});

	it("handles empty content", () => {
		expect(estimateRuleTokens("", "desc")).toBe(Math.ceil("desc\n".length / 4));
	});

	it("handles empty description", () => {
		expect(estimateRuleTokens("content", "")).toBe(
			Math.ceil("\ncontent".length / 4),
		);
	});
});

describe("sumTokens", () => {
	it("returns 0 for empty array", () => {
		expect(sumTokens([])).toBe(0);
	});

	it("sums all values", () => {
		expect(sumTokens([10, 20, 30])).toBe(60);
	});

	it("handles single element", () => {
		expect(sumTokens([42])).toBe(42);
	});
});

describe("computeBudgetUsage", () => {
	it("computes percentage and exceeded flag", () => {
		const usage = computeBudgetUsage(800, 2000);
		expect(usage.used).toBe(800);
		expect(usage.max).toBe(2000);
		expect(usage.percentage).toBe(40);
		expect(usage.exceeded).toBe(false);
	});

	it("detects exceeded budget", () => {
		const usage = computeBudgetUsage(2500, 2000);
		expect(usage.percentage).toBe(125);
		expect(usage.exceeded).toBe(true);
	});

	it("handles exact limit", () => {
		const usage = computeBudgetUsage(2000, 2000);
		expect(usage.percentage).toBe(100);
		expect(usage.exceeded).toBe(false);
	});

	it("handles zero max as 100% usage", () => {
		const usage = computeBudgetUsage(0, 0);
		expect(usage.percentage).toBe(100);
	});

	it("handles zero used", () => {
		const usage = computeBudgetUsage(0, 2000);
		expect(usage.percentage).toBe(0);
		expect(usage.exceeded).toBe(false);
	});
});
