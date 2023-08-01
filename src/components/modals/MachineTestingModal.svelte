<script lang="ts">
	import { ActionIcon, Button, Group, NativeSelect, Paper, Space, Stack, Text, TextInput, Title } from '@svelteuidev/core';
	import { Check, Cross2, Move } from 'radix-icons-svelte';
	import { createEventDispatcher } from 'svelte';
	import type { TestCase, TestCaseResult } from '../../app';
	import { SimState, type DFA, type NFA, type PDA, type TuringMachine } from '../../utils/utils';

	export let machine: DFA | NFA | PDA | TuringMachine | null, simulating: boolean, simState: SimState | null, results: TestCaseResult[] | null;

	let x = 0,
		y = 0,
		dragging = false,
		inputString = '',
		testCases: TestCase[] = [];

	const dispatch = createEventDispatcher<{ start: string; step: void; stop: void; reset: void; ff: void; test: TestCase[] }>();

	function move(evt: MouseEvent) {
		if (dragging) {
			x += evt.movementX;
			y += evt.movementY;
		}
	}

	function editResult(test: TestCase) {
		return (evt: CustomEvent) => {
			const target = evt.target as HTMLSelectElement;
			test.result = target.value === 'Accept';
		};
	}

	$: {
		if (!machine) {
			testCases = [];
		}
	}
</script>

<svelte:window on:mousemove={move} />
{#if machine !== null}
	<Paper style="position: absolute; top: {y}px; left: {x}px;">
		<Group style="justify-content: space-between;">
			<Title>Test {machine.type}</Title>
			<Group spacing={0}>
				<ActionIcon size="lg" radius="md" on:mousedown={() => (dragging = true)} on:mouseup={() => (dragging = false)}>
					<Move />
				</ActionIcon>
				<ActionIcon size="lg" radius="md" on:click={() => dispatch('stop')}>
					<Cross2 color="red" size={24} />
				</ActionIcon>
			</Group>
		</Group>
		<Space h="lg" />
		{#if simulating}
			<Stack>
				<Group>
					<Title order={3}>State:</Title>
					{#if simState === SimState.RUNNING}
						<Text color="yellow">Running</Text>
					{:else if simState === SimState.ACCEPTED}
						<Text color="lime">Accepted</Text>
					{:else if simState === SimState.REJECTED}
						<Text color="red">Rejected</Text>
					{:else if simState === SimState.DEAD}
						<Text color="red">Errored</Text>
					{/if}
				</Group>
				<Button on:click={() => dispatch('step')} disabled={simState !== SimState.RUNNING}>Step</Button>
				<Button on:click={() => dispatch('ff')} disabled={simState !== SimState.RUNNING}>Fast Forward</Button>
				<Button on:click={() => dispatch('reset')} color="red">Reset</Button>
			</Stack>
		{:else}
			<Group align="start" spacing="lg">
				<Stack align="start">
					<Title order={2}>Machine Debugger</Title>
					<TextInput label="Input String" bind:value={inputString} />
					<Button on:click={() => dispatch('start', inputString)}>Start</Button>
				</Stack>
				<Stack align="start">
					<Title order={2}>Test Cases</Title>
					<Stack>
						<Group align="start">
							<Stack>
								<Title order={4}>Input String</Title>
								{#each testCases as test}
									<TextInput bind:value={test.input} on:input={() => (results = null)} />
								{/each}
							</Stack>
							<Stack>
								<Title order={4}>Expected Result</Title>
								{#each testCases as test}
									<NativeSelect value={test.result ? 'Accept' : 'Reject'} data={['Accept', 'Reject']} on:change={editResult(test)} />
								{/each}
							</Stack>
						</Group>
						<Group>
							<Button on:click={() => (testCases = [...testCases, { input: '', result: false }])}>Add Test Case</Button>
							<Button color="green" on:click={() => dispatch('test', testCases)}>Run Tests</Button>
						</Group>
					</Stack>
				</Stack>
				{#if results}
					<Stack align="start">
						<Title order={2}>Test Results</Title>
						{#if machine.type === 'DFA' || machine.type === 'NFA'}
							<Stack>
								<Title order={4}>Passed</Title>
								{#each results as result}
									{#if result.match}
										<Check color="green" size={36} />
									{:else}
										<Cross2 color="red" size={36} />
									{/if}
								{/each}
							</Stack>
						{/if}
					</Stack>
				{/if}
			</Group>
		{/if}
	</Paper>
{/if}
