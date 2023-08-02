<script lang="ts">
	import { hotkey } from '@svelteuidev/composables';
	import { Button, Group, NativeSelect, Notification, Title, Tooltip } from '@svelteuidev/core';
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { quintOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import type { TestCase, TestCaseResult } from '../app';
	import { Engine, MouseButton } from '../utils/engine';
	import { Node, type NodeData } from '../utils/node';
	import { Point } from '../utils/point';
	import { Transition } from '../utils/transition';
	import { Accept, Reject, SimState, type DFA, type MachineType, type NFA, type PDA, type TuringMachine } from '../utils/utils';
	import SmallExclamation from './icons/SmallExclamation.svelte';
	import EditNodeMenu from './menus/EditNodeMenu.svelte';
	import EditTransitionMenu from './menus/EditTransitionMenu.svelte';
	import CreateNodeModal from './modals/CreateNodeModal.svelte';
	import EditConditionsModal from './modals/EditConditionsModal.svelte';
	import EditLabelModal from './modals/EditLabelModal.svelte';
	import MachineTestingModal from './modals/MachineTestingModal.svelte';

	enum ModalState {
		NONE,
		CREATE_NODE,
		EDIT_CONDITIONS,
		UPLOAD,
		EDIT_LABEL
	}

	enum MenuState {
		NONE,
		EDITING_NODE,
		EDITING_TRANSITION
	}

	let canvas: HTMLCanvasElement | undefined,
		engine: Engine | null,
		drawingLine = false,
		modalState: ModalState = ModalState.NONE,
		menuState: MenuState = MenuState.NONE,
		menuLocation: Point | null = null,
		editingNode: Node | null = null,
		editingTransition: Transition | null = null,
		machineType: MachineType = 'Auto',
		machine: DFA | NFA | PDA | TuringMachine | null = null,
		simulating: boolean = false,
		frozen: boolean = false,
		simState: SimState | null = null,
		testResults: TestCaseResult[] | null = null,
		errors: Error[] = [],
		nodeResolver: (data: NodeData) => void = () => {},
		nodeCanceler: () => void = () => {},
		cancelLine: () => void = () => {};

	onMount(() => {
		if (canvas) {
			engine = new Engine(canvas);

			engine.start();
			(window as any).engine = engine;

			engine.on('entityClicked', (entity, metadata) => {
				if (metadata.button === MouseButton.RIGHT) {
					if (entity instanceof Node) {
						menuState = MenuState.EDITING_NODE;
						editingNode = entity;
						menuLocation = metadata.pagePos.add(new Point(-25, 12.5));
					} else if (entity instanceof Transition) {
						menuState = MenuState.EDITING_TRANSITION;
						editingTransition = entity;
						menuLocation = metadata.pagePos.add(new Point(5, 0));
					}
				}
			});
		}
	});

	function createNode() {
		if (engine && !frozen) {
			cancelLine();
			engine.createNode(async () => {
				modalState = ModalState.CREATE_NODE;

				return new Promise<NodeData>((resolve, reject) => {
					nodeResolver = resolve;
					nodeCanceler = reject;
				});
			});
		}
	}

	function createTransition() {
		if (engine && !frozen) {
			let from: Node | null = null,
				to: Node | null = null;

			const off = engine.on('entityClicked', (entity, metadata) => {
				if (metadata.button === MouseButton.LEFT && entity instanceof Node) {
					if (!from) {
						from = entity;
					} else if (!engine?.connected(from, entity)) {
						to = entity;

						const transition = new Transition(from, to, []);
						engine?.add(transition, 0);

						editingTransition = transition;
						modalState = ModalState.EDIT_CONDITIONS;

						drawingLine = false;
						off();
					}
				} else {
					drawingLine = false;
					off();
				}
			});

			drawingLine = true;
			cancelLine = () => {
				off();
				drawingLine = false;
				cancelLine = () => {};
			};
		}
	}

	function submitNodeData(evt: CustomEvent<NodeData>): void {
		const data = evt.detail;

		nodeResolver(data);

		nodeResolver = () => {};
		nodeCanceler = () => {};
		modalState = ModalState.NONE;
	}

	function cancelCreateNode(): void {
		nodeCanceler();

		nodeResolver = () => {};
		nodeCanceler = () => {};
		modalState = ModalState.NONE;
	}

	function download(): void {
		exportImage().then((blob) => {
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = 'machine.png';
			anchor.click();
		});
	}

	function downloadJFF(): void {
		if (engine) {
			try {
				const jff = engine.exportJFF(machineType, {}, { requireAllTransitions: false });

				const blob = new Blob([jff]);
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement('a');
				anchor.href = url;
				anchor.download = 'machine.jff';
				anchor.click();
			} catch (err: unknown) {
				if (err instanceof Error) {
					errors = [...errors, err];
				} else {
					console.error(err);
				}
			}
		}
	}

	async function exportImage(): Promise<Blob> {
		return new Promise((res, rej) => {
			if (canvas) {
				canvas.toBlob((blob) => {
					if (!blob) {
						rej('couldnt export to blob');
					} else {
						res(blob);
					}
				});
			} else {
				rej('No canvas');
			}
		});
	}

	function compile() {
		if (engine) {
			try {
				machine = engine.compile(machineType, {}, { requireAllTransitions: false });
				frozen = true;
			} catch (err: unknown) {
				if (err instanceof Error) {
					errors = [...errors, err];
				} else {
					console.error(err);
				}
			}
		}
	}

	function simulate(inputString: string) {
		if (engine) {
			engine.simulate(inputString);
			simulating = true;
			simState = SimState.RUNNING;
		}
	}

	function advance() {
		if (engine) {
			try {
				engine.advance();
			} catch (result: unknown) {
				if (result instanceof Accept) {
					simState = SimState.ACCEPTED;
				} else if (result instanceof Reject) {
					simState = SimState.REJECTED;
				} else {
					simState = SimState.DEAD;
				}
			}
		}
	}

	function end() {
		if (engine) {
			engine.endSimulation();
			machine = null;
			simulating = false;
			frozen = false;
			simState = null;
			testResults = null;
		}
	}

	function reset() {
		if (engine) {
			engine.resetSimulation();
			simulating = false;
			simState = null;
		}
	}

	function fastForward() {
		if (engine) {
			try {
				engine.advance();
				setTimeout(fastForward, 50);
			} catch (result: unknown) {
				if (result instanceof Accept) {
					simState = SimState.ACCEPTED;
				} else if (result instanceof Reject) {
					simState = SimState.REJECTED;
				} else {
					simState = SimState.DEAD;
				}
			}
		}
	}

	function runTests(evt: CustomEvent<TestCase[]>) {
		if (engine) {
			try {
				const cases = evt.detail;

				testResults = cases.map((test) => {
					const result = engine!.eval(test.input);

					return { match: test.result === result.result, extra: result.extra };
				});
			} catch (err: unknown) {
				if (err instanceof Error) {
					errors = [...errors, err];
				} else {
					console.error(err);
				}
			}
		}
	}
</script>

<Group>
	<Tooltip label="Hotkey: d (noDe)">
		<Button
			use={[
				[
					hotkey,
					modalState === ModalState.NONE
						? [
								['n', createNode],
								['d', createNode]
						  ]
						: []
				]
			]}
			on:click={createNode}
			disabled={frozen}>Node</Button
		>
	</Tooltip>
	{#if drawingLine}
		<Button color="red" on:click={cancelLine}>Cancel</Button>
	{:else}
		<Tooltip label="Hotkey: t (Transition)">
			<Button
				use={[
					[
						hotkey,
						modalState === ModalState.NONE
							? [
									['c', createTransition],
									['t', createTransition]
							  ]
							: []
					]
				]}
				on:click={createTransition}
				disabled={frozen}>Transition</Button
			>
		</Tooltip>
	{/if}
	<Button on:click={download}>Download</Button>
	<NativeSelect data={['Auto', 'DFA', 'NFA', 'PDA', 'Turing Machine']} bind:value={machineType} />
	<Button on:click={compile} disabled={frozen}>Test Machine</Button>
	<Button on:click={downloadJFF} disabled={frozen}>Export to JFlap</Button>
	<Tooltip label="The PDA and Turing Machine stuff mostly doesn't work yet, I'll get those done by the time the class gets to them (hopefully).">
		<Title order={2} color="red">Important</Title>
	</Tooltip>
</Group>
<canvas height={800} width={1200} bind:this={canvas} />
<CreateNodeModal opened={modalState === ModalState.CREATE_NODE} on:submit={submitNodeData} on:cancel={cancelCreateNode} />
<MachineTestingModal
	bind:machine
	bind:results={testResults}
	on:start={(evt) => simulate(evt.detail)}
	on:step={advance}
	on:stop={end}
	on:reset={reset}
	on:ff={fastForward}
	on:test={runTests}
	{simulating}
	{simState}
/>
<div id="notifications">
	{#each errors as err (err)}
		<div transition:fly={{ x: -100, y: 0, duration: 200 }} animate:flip={{ duration: 200, easing: quintOut }}>
			<Notification title="Compilation Error" icon={SmallExclamation} color="red" on:close={() => (errors = errors.filter((e) => e !== err))}>
				{err.message}
			</Notification>
		</div>
	{/each}
</div>
{#key editingTransition}
	<EditConditionsModal
		{editingTransition}
		{machineType}
		opened={modalState === ModalState.EDIT_CONDITIONS}
		on:close={() => {
			modalState = ModalState.NONE;
			editingTransition = null;
		}}
	/>
{/key}
{#key editingNode}
	<EditLabelModal
		{editingNode}
		opened={modalState === ModalState.EDIT_LABEL}
		on:close={() => {
			modalState = ModalState.NONE;
			editingNode = null;
		}}
	/>
{/key}
{#if menuState === MenuState.EDITING_NODE && editingNode && menuLocation}
	<EditNodeMenu
		{menuLocation}
		{editingNode}
		on:close={() => {
			menuState = MenuState.NONE;
			editingNode = null;
			menuLocation = null;
		}}
		on:delete={(evt) => {
			const entity = evt.detail;

			if (engine) {
				engine.remove(entity);
			}
		}}
		on:editLabel={(evt) => {
			const node = evt.detail;

			modalState = ModalState.EDIT_LABEL;
			editingNode = node;
		}}
	/>
{:else if menuState === MenuState.EDITING_TRANSITION && editingTransition && menuLocation}
	<EditTransitionMenu
		{menuLocation}
		{editingTransition}
		findDoppel={(transition) => engine?.findDoppel(transition) || null}
		on:close={() => {
			menuState = MenuState.NONE;
			editingTransition = null;
			menuLocation = null;
		}}
		on:delete={(evt) => {
			const transition = evt.detail;

			if (engine) {
				engine.remove(transition);
			}
		}}
		on:editConditions={(evt) => {
			const transition = evt.detail;

			modalState = ModalState.EDIT_CONDITIONS;
			editingTransition = transition;
		}}
	/>
{/if}

<style>
	canvas {
		margin-top: 1em;
		margin-left: 1em;
		border: 1px solid black;
	}

	#notifications {
		position: absolute;
		top: 1em;
		right: 1em;
		width: 400px;
	}

	#notifications div {
		margin-bottom: 0.5em;
	}
</style>
