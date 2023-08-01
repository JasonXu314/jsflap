import type { EvalResult } from '../app';
import type { Entity, MouseData } from './entity';
import { DummyNode, Node, type DehydratedNode, type NodeData } from './node';
import { Point } from './point';
import { RenderEngine } from './renderEngine';
import { CycleSide, Transition, type DehydratedTransition } from './transition';
import {
	Accept,
	ConditionError,
	EPSILON,
	MachineValidationError,
	Reject,
	SymbolError,
	serializeType,
	type AlphabetSet,
	type DFA,
	type DFAState,
	type MachineState,
	type MachineType,
	type NFA,
	type NFAState,
	type PDA,
	type PDACondition,
	type PDAState,
	type TMCondition,
	type TMState,
	type TuringMachine,
	type ValidationOptions
} from './utils';

interface EngineEvents {
	entityClicked: (entity: Entity, metadata: { button: MouseButton; spacePos: Point; pagePos: Point }) => void;
	entityDblClicked: (entity: Entity) => void;
	click: (evt: MouseEvent) => void;
}

export enum MouseButton {
	LEFT,
	MIDDLE,
	RIGHT,
	BACK,
	FORWARD
}

export class Engine {
	private readonly context: CanvasRenderingContext2D;
	private readonly layers: Entity[][] = [[], []];
	private readonly renderEngine: RenderEngine;

	private _selectedEntity: Entity | null = null;
	private _mousePos: Point | null = null;
	private _mouseDown = false;
	private _mouseDelta: Point | null = null;
	private _machine: DFA | NFA | PDA | TuringMachine | null = null;
	private _nodeMap: Map<MachineState, Node> = new Map();
	private _timelines: [MachineState, number][] = [];
	private _stack: string[] = [];
	private _tape: (string | undefined)[] = [];
	private _input = '';

	private _listeners: { [K in keyof EngineEvents]: EngineEvents[K][] };

	private mouseListener: (evt: MouseEvent) => void = (evt) => {
		if (this._mousePos) {
			this._mousePos = this.renderEngine.canvasToSpace(new Point(evt.offsetX, evt.offsetY));

			if (this._mouseDelta) {
				this._mouseDelta.x += evt.movementX;
				this._mouseDelta.y -= evt.movementY;
			}
		}
	};

	constructor(private readonly canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d');

		if (ctx) {
			this.context = ctx;
			this.renderEngine = new RenderEngine(ctx, canvas);

			this._listeners = { entityClicked: [], click: [], entityDblClicked: [] };

			canvas.addEventListener('mouseout', () => {
				this._mousePos = null;

				canvas.removeEventListener('mousemove', this.mouseListener);
			});

			canvas.addEventListener('mouseover', (evt) => {
				this._mousePos = new Point(evt.offsetX, evt.offsetY);

				canvas.addEventListener('mousemove', this.mouseListener);
			});

			canvas.addEventListener('mousedown', () => {
				this._mouseDown = true;
				this._mouseDelta = new Point();
			});

			canvas.addEventListener('mouseup', (evt: MouseEvent) => {
				this._mouseDown = false;
				this._mouseDelta = null;

				if (this._selectedEntity) {
					for (const listener of this._listeners.entityClicked) {
						listener(this._selectedEntity, {
							button: evt.button,
							spacePos: this._mousePos!,
							pagePos: this.renderEngine.spaceToCanvas(this._mousePos!).add(new Point(16, 52))
						});
					}
				} else {
					for (const listener of this._listeners.click) {
						listener(evt);
					}
				}
			});

			canvas.addEventListener('dblclick', () => {
				if (this._selectedEntity) {
					for (const listener of this._listeners.entityDblClicked) {
						listener(this._selectedEntity);
					}
				}
			});

			canvas.addEventListener('contextmenu', (evt: MouseEvent) => {
				if (this._selectedEntity) {
					evt.preventDefault();
				}
			});
		} else {
			throw new Error('Unable to get canvas context');
		}
	}

	public add(entity: Entity, layer: number): void {
		while (layer >= this.layers.length) {
			this.layers.push([]);
		}

		this.layers[layer].push(entity);
	}

	public remove(entity: Entity, layer?: number): void {
		if (layer === undefined) {
			for (const layer of this.layers) {
				if (layer.includes(entity)) {
					layer.splice(layer.indexOf(entity), 1);
				}
			}
		} else {
			if (!this.layers[layer]) {
				throw new Error(`Layer ${layer} does not exist!`);
			} else if (!this.layers[layer].includes(entity)) {
				throw new Error(`Layer ${layer} does not contain entity!`);
			} else {
				this.layers[layer].splice(this.layers[layer].indexOf(entity), 1);
			}
		}

		if (!(entity instanceof Transition)) {
			for (const layer of this.layers) {
				const toRemove = layer.filter((e) => e instanceof Transition && (e.from === entity || e.to === entity));
				toRemove.forEach((line) => layer.splice(layer.indexOf(line), 1));
			}
		}
	}

	public start(): void {
		this._tick();
	}

	public on<T extends keyof EngineEvents>(evt: T, listener: EngineEvents[T]): () => void {
		this._listeners[evt].push(listener);

		return () => {
			this._listeners[evt].splice(this._listeners[evt].indexOf(listener), 1);
		};
	}

	public async createNode(getData: () => Promise<NodeData>): Promise<Node | null> {
		try {
			const dummyNode = new DummyNode();

			this.add(dummyNode, 1);

			const pos = await new Promise<Point>((resolve) => {
				this.on('entityClicked', () => {
					resolve(dummyNode.position);
				});
			});
			this.remove(dummyNode, 1);

			const data = await getData();

			const entity = new Node(data.label, data.start, data.end);
			entity.position = pos.clone();

			this.add(entity, 1);

			return entity;
		} catch (e: unknown) {
			console.error(e);
			return null;
		}
	}

	public connected(from: Node, to: Node): boolean {
		return this.layers.some((layer) => layer.some((entity) => entity instanceof Transition && entity.from === from && entity.to === to));
	}

	public findDoppel(transition: Transition): Transition | null {
		return (
			(this.layers
				.reduce((arr, layer) => [...arr, ...layer], [])
				.find((entity) => entity instanceof Transition && entity.from === transition.to && entity.to === transition.from) as Transition) || null
		);
	}

	public simulate(inputString: string): void {
		if (!this._machine) {
			throw new Error('No compiled machine.');
		}

		if (this._machine.type === 'DFA' || this._machine.type === 'Turing Machine') {
			this._timelines = [[this._machine.initial, 0]];
		} else {
			this._timelines = this._machine.initial.map((state) => [state, 0]);
		}

		if (this._machine.type !== 'Turing Machine') {
			this._input = inputString;
			this._tape = [];
		} else {
			this._tape = inputString.split('');
			this._input = '';
		}

		this._stack = [];
	}

	public endSimulation(): void {
		this._machine = null;
		this.resetSimulation();
	}

	public resetSimulation(): void {
		this._input = '';
		this._tape = [];
		this._stack = [];
		this._timelines = [];
	}

	public advance(): void {
		if (!this._machine) {
			throw new Error('No compiled machine.');
		}

		switch (this._machine.type) {
			case 'DFA':
			case 'NFA': {
				this._timelines.forEach(([s, idx], i) => {
					const character = this._input[idx];
					const state = s as DFAState | NFAState;

					if (character === undefined) {
						if (state.final) {
							throw new Accept();
						} else {
							if (this._timelines.length === 1) {
								throw new Reject();
							} else {
								this._timelines.splice(i, 1);
							}
						}
					} else {
						let stepped = false;

						state.transitions.forEach((transition) => {
							if (transition.conditions.includes(EPSILON)) {
								this._timelines[i] = [transition.to, idx];
								stepped = true;
							}

							if (transition.conditions.includes(character)) {
								if (stepped) {
									this._timelines.push([transition.to, idx + 1]);
								} else {
									this._timelines[i] = [transition.to, idx + 1];
									stepped = true;
								}
							}
						});
					}
				});
			}
		}
	}

	public eval(inputString: string): EvalResult {
		if (!this._machine) {
			throw new Error('No compiled machine.');
		}

		this._validateInput(inputString);

		switch (this._machine.type) {
			case 'DFA':
			case 'NFA': {
				return this._faEval(inputString);
			}
			default:
				return { result: false, extra: {} };
		}
	}

	private _faEval(inputString: string): EvalResult {
		if (!this._machine) {
			throw new Error('No compiled machine.');
		}

		if (this._machine.type !== 'DFA' && this._machine.type !== 'NFA') {
			throw new Error('Machine is not DFA or NFA');
		}

		const timelines: [DFAState | NFAState, number][] =
			this._machine.type === 'DFA' ? [[this._machine.initial, 0]] : this._machine.initial.map((state) => [state, 0]);

		while (true) {
			for (let i = 0; i < timelines.length; i++) {
				const [s, idx] = timelines[i];
				const character = inputString[idx];
				const state = s as DFAState | NFAState;

				if (character === undefined) {
					if (state.final) {
						return { result: true, extra: {} };
					} else {
						// TODO: resolve edge cases where epsilon transition from end node (or from any node to itself) will cause problems
						if (timelines.length === 1) {
							return { result: false, extra: {} };
						} else {
							timelines.splice(i, 1);
						}
					}
				} else {
					let stepped = false;

					state.transitions.forEach((transition) => {
						if (transition.conditions.includes(EPSILON)) {
							timelines[i] = [transition.to, idx];
							stepped = true;
						}

						if (transition.conditions.includes(character)) {
							if (stepped) {
								timelines.push([transition.to, idx + 1]);
							} else {
								timelines[i] = [transition.to, idx + 1];
								stepped = true;
							}
						}
					});
				}
			}
		}
	}

	public compile(as: 'DFA', alphabets: AlphabetSet, options: ValidationOptions): DFA;
	public compile(as: 'NFA', alphabets: AlphabetSet, options: ValidationOptions): NFA;
	public compile(as: 'PDA', alphabets: AlphabetSet, options: ValidationOptions): PDA;
	public compile(as: 'Turing Machine', alphabets: AlphabetSet, options: ValidationOptions): TuringMachine;
	public compile(as: 'Auto', alphabets: AlphabetSet, options: ValidationOptions): DFA | NFA | PDA | TuringMachine;
	public compile(as: MachineType, alphabets: AlphabetSet, options: ValidationOptions): DFA | NFA | PDA | TuringMachine;
	public compile(as: MachineType, alphabets: AlphabetSet, options: ValidationOptions): DFA | NFA | PDA | TuringMachine {
		switch (as) {
			case 'DFA':
				this._nodeMap.clear();
				this.validate('DFA', alphabets, options);
				this._machine = this._compileDFA(alphabets.alphabet);
				return this._machine;
			case 'NFA':
				this._nodeMap.clear();
				this.validate('NFA', alphabets, options);
				this._machine = this._compileNFA(alphabets.alphabet);
				return this._machine;
			case 'PDA':
				this._nodeMap.clear();
				this.validate('PDA', alphabets, options);
				this._machine = this._compilePDA(alphabets.alphabet, alphabets.stackAlphabet);
				return this._machine;
			case 'Turing Machine':
				this._nodeMap.clear();
				this.validate('Turing Machine', alphabets, options);
				this._machine = this._compileTuringMachine(alphabets.alphabet, alphabets.tapeAlphabet);
				return this._machine;
			case 'Auto': {
				try {
					this._nodeMap.clear();
					this.validate('Turing Machine', alphabets, options);
					this._machine = this._compileTuringMachine(alphabets.alphabet, alphabets.tapeAlphabet);
					return this._machine;
				} catch {
					void 0;
				}
				try {
					this._nodeMap.clear();
					this.validate('PDA', alphabets, options);
					this._machine = this._compilePDA(alphabets.alphabet, alphabets.stackAlphabet);
					return this._machine;
				} catch {
					void 0;
				}
				try {
					this._nodeMap.clear();
					this.validate('DFA', alphabets, options);
					this._machine = this._compileDFA(alphabets.alphabet);
					return this._machine;
				} catch {
					void 0;
				}
				try {
					this._nodeMap.clear();
					this.validate('NFA', alphabets, options);
					this._machine = this._compileNFA(alphabets.alphabet);
					return this._machine;
				} catch {
					throw new Error('Unable to compile as any FSM; check your machine and try again.');
				}
			}
		}
	}

	public validate(
		as: Exclude<MachineType, 'Auto'>,
		{ alphabet, stackAlphabet, tapeAlphabet }: AlphabetSet,
		{ requireAllTransitions }: ValidationOptions
	): void {
		const nodes = this.layers[1] as Node[];
		const transitions = this.layers[0] as Transition[];

		switch (as) {
			case 'NFA':
			case 'DFA': {
				let initialNode: Node | null = null;
				for (const node of nodes) {
					if (as === 'DFA' && initialNode && node.start) {
						throw new Error(`Failed to validate as ${as}: '${initialNode.label}' and '${node.label}' states both marked as initial states.`);
					}

					if (node.start) {
						initialNode = node;
					}
				}

				if (!initialNode) {
					throw new Error(`Failed to validate as ${as}: no initial state.`);
				}

				const alpha = alphabet ? new Set<string>(alphabet) : new Set<string>(),
					outgoingTransitions = new Map<Node, Transition[]>();
				for (const transition of transitions) {
					for (const symbol of transition.conditions) {
						if (symbol.length !== 1) {
							throw new SymbolError(as, symbol, transition, 'must be one character long');
						}

						if (!alphabet) {
							alpha.add(symbol);
						}
					}

					if (!outgoingTransitions.has(transition.from)) {
						outgoingTransitions.set(transition.from, [transition]);
					} else {
						outgoingTransitions.set(transition.from, [...outgoingTransitions.get(transition.from)!, transition]);
					}
				}

				for (const [node, transitions] of outgoingTransitions) {
					const searching = new Set(alpha);

					for (const transition of transitions) {
						for (const symbol of transition.conditions) {
							if (!alpha.has(symbol) && as === 'NFA' && symbol !== EPSILON) {
								throw new ConditionError(as, symbol, transition, 'not found in alphabet');
							}

							if ((as === 'DFA' || requireAllTransitions) && !searching.has(symbol)) {
								throw new MachineValidationError(as, `Node '${node.label}' has more than one outgoing transition for symbol '${symbol}'.`);
							}

							searching.delete(symbol);
						}
					}

					if ((as === 'DFA' || requireAllTransitions) && searching.size !== 0) {
						throw new MachineValidationError(
							as,
							`Node '${node.label}' is missing outgoing transitions for symbols ${Array.from(searching)
								.map((symbol) => `'${symbol}'`)
								.join(', ')}.`
						);
					}
				}

				return;
			}
			case 'PDA': {
				let initialNode: Node | null = null;
				for (const node of nodes) {
					if (node.start) {
						initialNode = node;
						break;
					}
				}

				if (!initialNode) {
					throw new Error('Failed to validate as PDA: no initial state.');
				}

				const alpha = alphabet ? new Set<string>(alphabet) : new Set<string>(),
					stackAlpha = stackAlphabet ? new Set<string>(stackAlphabet) : new Set<string>(),
					outgoingTransitions = new Map<Node, Transition[]>();
				for (const transition of transitions) {
					for (const condition of transition.conditions) {
						if (!/. . [NPp] ./.test(condition)) {
							throw new ConditionError(as, condition, transition, "couldn't be parsed as a PDA condition");
						}

						const [symbol, readStackSymbol, action, actionStackSymbol] = condition.split(' ');

						if (symbol.length !== 1) {
							throw new SymbolError(as, symbol, transition, 'must be one character long');
						}
						if (readStackSymbol.length !== 1) {
							throw new SymbolError(as, readStackSymbol, transition, 'must be one character long');
						}
						if (actionStackSymbol.length !== 1) {
							throw new SymbolError(as, actionStackSymbol, transition, 'must be one character long');
						}
						if (action !== 'Push' && action !== 'Pop') {
							throw new MachineValidationError(as, `Stack action ${action} must be either 'Push' or 'Pop'.`);
						}

						if (!alphabet) {
							alpha.add(symbol);
						}
						if (!stackAlphabet) {
							stackAlpha.add(readStackSymbol);
							stackAlpha.add(actionStackSymbol);
						}
					}

					if (!outgoingTransitions.has(transition.from)) {
						outgoingTransitions.set(transition.from, [transition]);
					} else {
						outgoingTransitions.set(transition.from, [...outgoingTransitions.get(transition.from)!, transition]);
					}
				}

				for (const [node, transitions] of outgoingTransitions) {
					const symbolSearching = new Set(alpha);

					for (const transition of transitions) {
						for (const condition of transition.conditions) {
							const [symbol, readStackSymbol, , actionStackSymbol] = condition.split(' ');

							if (!alpha.has(symbol)) {
								throw new ConditionError(as, symbol, transition, 'not found in alphabet');
							}
							if (!stackAlpha.has(readStackSymbol)) {
								throw new ConditionError(as, readStackSymbol, transition, 'not found in stack alphabet');
							}
							if (!stackAlpha.has(actionStackSymbol)) {
								throw new ConditionError(as, actionStackSymbol, transition, 'not found in stack alphabet');
							}

							symbolSearching.delete(symbol);
						}
					}

					if (requireAllTransitions && symbolSearching.size !== 0) {
						throw new MachineValidationError(
							as,
							`Node '${node.label}' is missing outgoing transitions for symbols ${Array.from(symbolSearching)
								.map((symbol) => `'${symbol}'`)
								.join(', ')}.`
						);
					}
				}

				return;
			}
			case 'Turing Machine': {
				let initialNode: Node | null = null,
					acceptNode: Node | null = null,
					rejectNode: Node | null = null;
				for (const node of nodes) {
					if (node.start) {
						if (!initialNode) {
							initialNode = node;
						} else {
							throw new MachineValidationError(as, 'Multiple starting states.');
						}
					}

					if (node.end) {
						if (node.label === 'accept') {
							if (!acceptNode) {
								acceptNode = node;
							} else {
								throw new MachineValidationError(as, 'Multiple accept states.');
							}
						} else if (node.label === 'reject') {
							if (!rejectNode) {
								rejectNode = node;
							} else {
								throw new MachineValidationError(as, 'Multiple reject states.');
							}
						} else {
							throw new MachineValidationError(as, 'An end state must be either an `accept` or a `reject` state (check labels).');
						}
					}
				}

				if (!initialNode) {
					throw new Error('Failed to validate as Turing Machine: no initial state.');
				}
				if (!acceptNode) {
					throw new Error('Failed to validate as Turing Machine: no accept state.');
				}
				if (!rejectNode) {
					throw new Error('Failed to validate as Turing Machine: no reject state.');
				}

				const alpha = alphabet ? new Set<string>(alphabet) : new Set<string>(),
					tapeAlpha = tapeAlphabet ? new Set<string>(tapeAlphabet) : new Set<string>(),
					outgoingTransitions = new Map<Node, Transition[]>();
				for (const transition of transitions) {
					for (const condition of transition.conditions) {
						if (!/. . [NRL]/.test(condition)) {
							throw new ConditionError(as, condition, transition, "couldn't be parsed as a Turing Machine condition");
						}

						const [readSymbol, writeSymbol, movement] = condition.split(' ');

						if (readSymbol.length !== 1) {
							throw new SymbolError(as, readSymbol, transition, 'must be one character long');
						}
						if (writeSymbol.length !== 1) {
							throw new SymbolError(as, writeSymbol, transition, 'must be one character long');
						}
						if (movement !== 'N' && movement !== 'R' && movement !== 'L') {
							throw new MachineValidationError(as, `Stack action ${movement} must be 'N', 'R', or 'L'.`);
						}

						if (!alphabet) {
							alpha.add(readSymbol);
						}
						if (!tapeAlphabet) {
							tapeAlpha.add(readSymbol);
							tapeAlpha.add(writeSymbol);
						}
					}

					if (!outgoingTransitions.has(transition.from)) {
						outgoingTransitions.set(transition.from, [transition]);
					} else {
						outgoingTransitions.set(transition.from, [...outgoingTransitions.get(transition.from)!, transition]);
					}
				}

				for (const [node, transitions] of outgoingTransitions) {
					const symbolSearching = new Set(tapeAlpha);

					for (const transition of transitions) {
						for (const condition of transition.conditions) {
							const [readSymbol, writeSymbol] = condition.split(' ');

							if (!tapeAlpha.has(readSymbol)) {
								throw new ConditionError(as, readSymbol, transition, 'not found in tape alphabet');
							}
							if (!tapeAlpha.has(writeSymbol)) {
								throw new ConditionError(as, writeSymbol, transition, 'not found in tape alphabet');
							}

							symbolSearching.delete(readSymbol);
						}
					}

					if (requireAllTransitions && symbolSearching.size !== 0) {
						throw new MachineValidationError(
							as,
							`Node '${node.label}' is missing outgoing transitions for symbols ${Array.from(symbolSearching)
								.map((symbol) => `'${symbol}'`)
								.join(', ')}.`
						);
					}
				}

				return;
			}
		}
	}

	private _compileDFA(alpha?: Set<string>): DFA {
		const nodes = this.layers[1] as Node[];
		const transitions = this.layers[0] as Transition[];
		const nodeMap = new Map<Node, DFAState>();

		const final: DFAState[] = [];
		let initial: DFAState | null = null;
		for (const node of nodes) {
			const state = { label: node.label, initial: node.start, final: node.end, transitions: [] };
			nodeMap.set(node, state);

			if (node.start) {
				initial = state;
			}
			if (node.end) {
				final.push(state);
			}
		}

		if (!initial) throw new Error('Failed to compile as DFA: missing initial state.');

		const alphabet = alpha ? new Set<string>(alpha) : new Set<string>();
		for (const transition of transitions) {
			const from = nodeMap.get(transition.from)!,
				to = nodeMap.get(transition.to)!;

			from.transitions.push({ conditions: transition.conditions, from, to });

			if (alpha) {
				for (const condition of transition.conditions) {
					if (!alphabet.has(condition)) {
						throw new Error('Failed to compile as DFA: unrecognized symbol.');
					}
				}
			} else {
				transition.conditions.forEach((symbol) => alphabet.add(symbol));
			}
		}

		this._nodeMap = new Map([...nodeMap.entries()].map(([n1, n2]) => [n2, n1]));
		return { type: 'DFA', final, initial, alphabet };
	}

	private _compileNFA(alpha?: Set<string>): NFA {
		const nodes = this.layers[1] as Node[];
		const transitions = this.layers[0] as Transition[];
		const nodeMap = new Map<Node, NFAState>();

		const final: NFAState[] = [],
			initial: NFAState[] = [];
		for (const node of nodes) {
			const state = { label: node.label, initial: node.start, final: node.end, transitions: [] };
			nodeMap.set(node, state);

			if (node.start) {
				initial.push(state);
			}
			if (node.end) {
				final.push(state);
			}
		}

		if (!initial) throw new Error('Failed to compile as NFA: missing initial state.');

		const alphabet = alpha ? new Set<string>(alpha) : new Set<string>();
		for (const transition of transitions) {
			const from = nodeMap.get(transition.from)!,
				to = nodeMap.get(transition.to)!;

			from.transitions.push({ conditions: transition.conditions, from, to });

			if (alpha) {
				for (const condition of transition.conditions) {
					if (!alphabet.has(condition)) {
						throw new Error('Failed to compile as NFA: unrecognized symbol.');
					}
				}
			} else {
				transition.conditions.forEach((symbol) => alphabet.add(symbol));
			}
		}

		this._nodeMap = new Map([...nodeMap.entries()].map(([n1, n2]) => [n2, n1]));
		return { type: 'NFA', final, initial, alphabet };
	}

	private _compilePDA(alpha?: Set<string>, stackAlpha?: Set<string>): PDA {
		const nodes = this.layers[1] as Node[];
		const transitions = this.layers[0] as Transition[];
		const nodeMap = new Map<Node, PDAState>();

		const final: PDAState[] = [],
			initial: PDAState[] = [];
		for (const node of nodes) {
			const state = { label: node.label, initial: node.start, final: node.end, transitions: [] };
			nodeMap.set(node, state);

			if (node.start) {
				initial.push(state);
			}
			if (node.end) {
				final.push(state);
			}
		}

		if (initial.length === 0) throw new Error('Failed to compile as PDA: missing initial state.');

		const alphabet = alpha ? new Set<string>(alpha) : new Set<string>(),
			stackAlphabet = stackAlpha ? new Set<string>(stackAlpha) : new Set<string>();
		for (const transition of transitions) {
			const from = nodeMap.get(transition.from)!,
				to = nodeMap.get(transition.to)!;
			const conditions: PDACondition[] = [];

			for (const condition of transition.conditions) {
				const [symbol, readStackSymbol, action, actionStackSymbol] = condition.split(' ');

				if (alpha) {
					if (!alphabet.has(symbol)) {
						throw new SymbolError('PDA', symbol, transition, 'unrecognized symbol');
					}
				} else {
					alphabet.add(symbol);
				}
				if (stackAlpha) {
					if (!stackAlphabet.has(readStackSymbol)) {
						throw new SymbolError('PDA', readStackSymbol, transition, 'unrecognized stack symbol');
					}
				} else {
					stackAlphabet.add(readStackSymbol);
				}
				if (stackAlpha) {
					if (!stackAlphabet.has(actionStackSymbol)) {
						throw new SymbolError('PDA', actionStackSymbol, transition, 'unrecognized stack symbol');
					}
				} else {
					stackAlphabet.add(actionStackSymbol);
				}
				if (action !== 'Push' && action !== 'Pop') {
					throw new MachineValidationError('PDA', `Stack action ${action} must be either 'Push' or 'Pop'.`);
				}

				conditions.push({ symbol, readStackSymbol, action, actionStackSymbol });
			}

			from.transitions.push({ conditions, from, to });
		}

		this._nodeMap = new Map([...nodeMap.entries()].map(([n1, n2]) => [n2, n1]));
		return { type: 'PDA', final, initial, alphabet, stackAlphabet };
	}

	private _compileTuringMachine(alpha?: Set<string>, tapeAlpha?: Set<string>): TuringMachine {
		const nodes = this.layers[1] as Node[];
		const transitions = this.layers[0] as Transition[];
		const nodeMap = new Map<Node, TMState>();

		let initial: TMState | null = null,
			acceptNode: TMState | null = null,
			rejectNode: TMState | null = null;
		for (const node of nodes) {
			const state = { label: node.label, initial: node.start, final: node.end, transitions: [] };
			nodeMap.set(node, state);

			if (node.start) {
				initial = state;
			}

			if (node.end) {
				if (node.label === 'accept') {
					acceptNode = state;
				} else if (node.label === 'reject') {
					rejectNode = state;
				}
			}
		}

		if (!initial) throw new Error('Failed to compile as Turing Machine: missing initial state.');
		if (!acceptNode) throw new Error('Failed to compile as Turing Machine: missing accept state.');
		if (!rejectNode) throw new Error('Failed to compile as Turing Machine: missing reject state.');
		const final = [acceptNode, rejectNode];

		const alphabet = alpha ? new Set<string>(alpha) : new Set<string>(),
			tapeAlphabet = tapeAlpha ? new Set<string>(tapeAlpha) : new Set<string>();
		for (const transition of transitions) {
			const from = nodeMap.get(transition.from)!,
				to = nodeMap.get(transition.to)!;
			const conditions: TMCondition[] = [];

			for (const condition of transition.conditions) {
				const [readSymbol, writeSymbol, movement] = condition.split(' ');

				if (!alpha) {
					alphabet.add(readSymbol);
				}
				if (tapeAlpha) {
					if (!tapeAlphabet.has(readSymbol)) {
						throw new SymbolError('Turing Machine', readSymbol, transition, 'unrecognized tape symbol');
					}
				} else {
					tapeAlphabet.add(readSymbol);
				}
				if (tapeAlpha) {
					if (!tapeAlphabet.has(writeSymbol)) {
						throw new SymbolError('PDA', writeSymbol, transition, 'unrecognized tape symbol');
					}
				} else {
					tapeAlphabet.add(writeSymbol);
				}
				if (movement !== 'N' && movement !== 'L' && movement !== 'R') {
					throw new MachineValidationError('Turing Machine', `Tape movement ${movement} must be 'N', 'L', or 'R'.`);
				}

				conditions.push({ readSymbol, writeSymbol, movement });
			}

			from.transitions.push({ conditions, from, to });
		}

		this._nodeMap = new Map([...nodeMap.entries()].map(([n1, n2]) => [n2, n1]));
		return { type: 'Turing Machine', final, initial, alphabet, tapeAlphabet };
	}

	public export(): string {
		const entityToIndex: Map<Entity, number> = new Map();
		const entities: Entity[] = [];
		let idx = 0;

		const reversedLayers = this.layers.reduce<Entity[][]>((arr, layer) => [layer, ...arr], []);
		for (const layer of reversedLayers) {
			const reversedEntities = layer.reduce<Entity[]>((arr, entity) => [entity, ...arr], []);

			for (const entity of reversedEntities) {
				entities.push(entity);
				entityToIndex.set(entity, idx);
				idx++;
			}
		}

		return JSON.stringify(entities.map((entity) => entity.serialize(entityToIndex.get(entity)!, (entity) => entityToIndex.get(entity)!)));
	}

	public exportJFF(as: 'DFA', alphabets: AlphabetSet, options: ValidationOptions): string;
	public exportJFF(as: 'NFA', alphabets: AlphabetSet, options: ValidationOptions): string;
	public exportJFF(as: 'PDA', alphabets: AlphabetSet, options: ValidationOptions): string;
	public exportJFF(as: 'Turing Machine', alphabets: AlphabetSet, options: ValidationOptions): string;
	public exportJFF(as: 'Auto', alphabets: AlphabetSet, options: ValidationOptions): string;
	public exportJFF(as: MachineType, alphabets: AlphabetSet, options: ValidationOptions): string;
	public exportJFF(as: MachineType, alphabets: AlphabetSet, options: ValidationOptions): string {
		const nodeToIndex: Map<Node, number> = new Map();
		const nodes: Node[] = [];
		const transitions: Transition[] = [];
		let idx = 0;

		const reversedLayers = this.layers.reduce<Entity[][]>((arr, layer) => [layer, ...arr], []);
		for (const layer of reversedLayers) {
			const reversedEntities = layer.reduce<Entity[]>((arr, entity) => [entity, ...arr], []);

			for (const entity of reversedEntities) {
				if (entity instanceof Node) {
					nodes.push(entity);
					nodeToIndex.set(entity, idx);
					idx++;
				} else if (entity instanceof Transition) {
					transitions.push(entity);
				}
			}
		}

		const type = this._determineType(as, alphabets, options);

		return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><!--Created with JFLAP 7.1.--><structure>
	<type>${serializeType(type)}</type>
	<automaton>
		<!--The list of states.-->
		${nodes
			.map(
				(node) => `<state id="${nodeToIndex.get(node)}" name="${node.label}">
			<x>${node.position.x}</x>
			<y>${node.position.y}</y>
		${node.start ? '\t<initial/>\n\t\t' : ''}${node.end ? '\t<final/>\n\t\t' : ''}</state>`
			)
			.join('\n\t\t')}
		${transitions
			.map((transition) =>
				transition.conditions
					.map(
						(condition) => `<transition>
			<from>${nodeToIndex.get(transition.from)}</from>
			<to>${nodeToIndex.get(transition.to)}</to>
			<read>${condition}</read>
		</transition>`
					)
					.join('\n\t\t')
			)
			.join('\n\t\t')}
	</automaton>
</structure>`;
	}

	public load(dehydratedEntities: { type: string }[]): void {
		const entities: Entity[] = [];

		dehydratedEntities.forEach((dehydratedEntity) => {
			switch (dehydratedEntity.type) {
				case 'NODE': {
					const data = dehydratedEntity as DehydratedNode;
					const entity = Node.deserialize(data);
					entities[data.id] = entity;
					this.add(entity, 1);
					break;
				}
				case 'TRANSITION': {
					const { from: fromId, id, to: toId, conditions, cycleState, type } = dehydratedEntity as DehydratedTransition;
					const from = entities[fromId],
						to = entities[toId];

					if (!(from instanceof Node) || !(to instanceof Node)) {
						throw new Error('Transitions may only connect from nodes to nodes.');
					}

					const entity = Transition.deserialize({ from, to, cycleState, type, conditions });
					entities[id] = entity;
					this.add(entity, 0);
					break;
				}
			}
		});
	}

	private _tick(): void {
		requestAnimationFrame(() => this._tick());

		if (!this._mouseDown) {
			this._updateSelectedEntity();
		}

		if (this._selectedEntity) {
			this.canvas.style.cursor = 'pointer';
		} else {
			this.canvas.style.cursor = 'unset';
		}

		const relationshipLinks: [Node, Node, Transition][] = [];
		this.layers.forEach((layer) => {
			layer.forEach((entity) => {
				if (entity instanceof Transition) {
					let relationship: [Node, Node, Transition];
					if ((relationship = relationshipLinks.find(([from, to]) => entity.from === to && entity.to === from)!)) {
						relationship[2].cycleState = CycleSide.LEFT;
						entity.cycleState = CycleSide.RIGHT;

						relationshipLinks.splice(
							relationshipLinks.findIndex(([, , t]) => t === relationship[2]),
							1
						);
					} else if (entity.from !== entity.to) {
						relationshipLinks.push([entity.from, entity.to, entity]);
					}
				}
			});
		});

		this.layers.forEach((layer) => {
			layer.forEach((entity) => {
				if (entity instanceof Transition && entity.cycleState !== null && relationshipLinks.some(([, , t]) => t === entity)) {
					entity.cycleState = null;
				}
			});
		});

		this.layers.forEach((layer) => {
			layer.forEach((entity) => {
				entity.update({
					selected: this._selectedEntity === entity,
					mouse: { down: this._mouseDown, delta: this._mouseDelta, position: this._mousePos?.clone() || null } as MouseData,
					active: entity instanceof Node && this._timelines.some(([state]) => this._nodeMap.get(state) === entity)
				});
			});
		});

		this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.context.fillStyle = 'white';
		this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.context.fillStyle = 'black';
		this.layers.forEach((layer) => {
			layer.forEach((entity) => {
				entity.render(this.renderEngine, {
					selected: this._selectedEntity === entity,
					mouse: null,
					active: entity instanceof Node && this._timelines.some(([state]) => this._nodeMap.get(state) === entity)
				});
			});
		});

		if (this._mouseDelta) {
			this._mouseDelta = new Point();
		}
	}

	private _validateInput(inputString: string): void {
		if (this._machine) {
			for (const char of inputString) {
				if (!this._machine.alphabet.has(char)) {
					throw new Error(`Invalid input character '${char}'`);
				}
			}
		}
	}

	private _determineType(as: MachineType, alphabets: AlphabetSet, options: ValidationOptions): Exclude<MachineType, 'Auto'> {
		switch (as) {
			case 'DFA':
				this._nodeMap.clear();
				this.validate('DFA', alphabets, options);
				return 'DFA';
			case 'NFA':
				this._nodeMap.clear();
				this.validate('NFA', alphabets, options);
				return 'NFA';
			case 'PDA':
				this._nodeMap.clear();
				this.validate('PDA', alphabets, options);
				return 'PDA';
			case 'Turing Machine':
				this._nodeMap.clear();
				this.validate('Turing Machine', alphabets, options);
				return 'Turing Machine';
			case 'Auto': {
				try {
					this._nodeMap.clear();
					this.validate('Turing Machine', alphabets, options);
					return 'Turing Machine';
				} catch {
					void 0;
				}
				try {
					this._nodeMap.clear();
					this.validate('PDA', alphabets, options);
					return 'PDA';
				} catch {
					void 0;
				}
				try {
					this._nodeMap.clear();
					this.validate('DFA', alphabets, options);
					return 'DFA';
				} catch {
					void 0;
				}
				try {
					this._nodeMap.clear();
					this.validate('NFA', alphabets, options);
					return 'NFA';
				} catch {
					throw new Error('Unable to compile as any FSM; check your machine and try again.');
				}
			}
		}
	}

	private _updateSelectedEntity(): void {
		if (this._mousePos) {
			const reversedLayers = this.layers.reduce<Entity[][]>((arr, layer) => [layer, ...arr], []);

			for (const layer of reversedLayers) {
				const reversedEntities = layer.reduce<Entity[]>((arr, entity) => [entity, ...arr], []);

				for (const entity of reversedEntities) {
					if (entity.selectedBy(this._mousePos, this.renderEngine)) {
						this._selectedEntity = entity;
						return;
					}
				}
			}
		}

		this._selectedEntity = null;
	}
}

