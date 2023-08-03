import { Point } from './point';
import type { Transition } from './transition';

export type MachineType = 'Auto' | 'DFA' | 'NFA' | 'PDA' | 'Turing Machine';

export interface AlphabetSet {
	alphabet?: Set<string>;
	stackAlphabet?: Set<string>;
	tapeAlphabet?: Set<string>;
}

export interface ValidationOptions {
	requireAllTransitions: boolean;
}

export interface Machine<Initial extends MachineState | MachineState[], Final extends MachineState | MachineState[]> {
	type: Exclude<MachineType, 'Auto'>;
	alphabet: Set<string>;
	initial: Initial;
	final: Final;
}

export type DFA = Machine<DFAState, DFAState[]> & { type: 'DFA' };
export type NFA = Machine<NFAState[], NFAState[]> & { type: 'NFA' };
export type PDA = Machine<PDAState[], PDAState[]> & { type: 'PDA'; stackAlphabet: Set<string> };
export type TuringMachine = Machine<TMState, TMState[]> & { type: 'Turing Machine'; tapeAlphabet: Set<string> };

export interface MachineState {
	label: string;
	initial: boolean;
	final: boolean;
}

export interface MachineTransition<State extends MachineState, Condition> {
	from: State;
	to: State;
	conditions: Condition[];
}

export type PDACondition = { symbol: string; action: 'Push' | 'Pop'; readStackSymbol: string; actionStackSymbol: string };
export type TMCondition = { readSymbol: string; writeSymbol: string; movement: string };

export interface DFAState extends MachineState {
	transitions: MachineTransition<DFAState, string>[];
}

export interface NFAState extends MachineState {
	transitions: MachineTransition<NFAState, string>[];
}

export interface PDAState extends MachineState {
	transitions: MachineTransition<PDAState, PDACondition>[];
}

export interface TMState extends MachineState {
	transitions: MachineTransition<TMState, TMCondition>[];
}

export class MachineValidationError extends Error {
	constructor(type: MachineType, message: string) {
		super(`Failed to validate as ${type}: ${message}`);
	}
}

export class ConditionError extends MachineValidationError {
	constructor(type: MachineType, condition: string, transition: Transition, extra: string) {
		super(type, `Transition condition ${condition} between '${transition.from.label}' and '${transition.to.label}' ${extra}.`);
	}
}

export class SymbolError extends MachineValidationError {
	constructor(type: MachineType, symbol: string, transition: Transition, extra: string) {
		super(type, `Transition symbol ${symbol} between '${transition.from.label}' and '${transition.to.label}' ${extra}.`);
	}
}

export class Accept {}
export class Reject {}
export class Blowup {}

export enum SimState {
	RUNNING,
	ACCEPTED,
	REJECTED,
	DEAD
}

export const EPSILON = 'ε';

export function calculateIntersection(c1: Point, c2: Point, r1: number, r2: number) {
	const R = c1.distanceTo(c2);
	const [x1, y1] = c1,
		[x2, y2] = c2;

	return [0.5, -0.5]
		.map((c) => c * Math.sqrt(2 * ((r1 ** 2 + r2 ** 2) / R ** 2) - (r1 ** 2 - r2 ** 2) ** 2 / R ** 4 - 1))
		.map((c) => new Point(y2 - y1, x1 - x2).times(c))
		.map((pt) => pt.add(new Point(x2 - x1, y2 - y1).times((r1 ** 2 - r2 ** 2) / (2 * R ** 2))))
		.map((pt) => pt.add(new Point(x1 + x2, y1 + y2).times(0.5)));
}

export function calculateLHIntersection(c1: Point, c2: Point, r1: number, r2: number) {
	const [, int] = calculateIntersection(c1, c2, r1, r2);

	return int;
}

export function calculateRHIntersection(c1: Point, c2: Point, r1: number, r2: number) {
	const [int] = calculateIntersection(c1, c2, r1, r2);

	return int;
}

export function serializeType(type: Exclude<MachineType, 'Auto'>): string {
	switch (type) {
		case 'DFA':
		case 'NFA':
			return 'fa';
		case 'PDA':
			return 'pda';
		case 'Turing Machine':
			return 'turing';
	}
}

