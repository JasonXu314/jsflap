// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

export interface TestCase {
	input: string;
	result: boolean;
}

export interface EvalResult {
	result: boolean;
	extra: {
		tape?: string[];
		stack?: string[];
	};
}

export interface TestCaseResult {
	match: boolean;
	extra: {
		tape?: string[];
		stack?: string[];
	};
}

