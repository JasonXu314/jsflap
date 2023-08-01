<script lang="ts">
	import { clipboard } from '@svelteuidev/composables';
	import { Button, CloseButton, Group, Modal, Stack, TextInput, Tooltip } from '@svelteuidev/core';
	import { QuestionMarkCircled } from 'radix-icons-svelte';
	import { createEventDispatcher } from 'svelte';
	import type { Transition } from '../../utils/transition';
	import { EPSILON, type MachineType } from '../../utils/utils';
	import PdaConditionInput from '../inputs/PDAConditionInput.svelte';
	import TmConditionInput from '../inputs/TMConditionInput.svelte';

	export let opened: boolean, editingTransition: Transition | null, machineType: MachineType;

	if (opened && !editingTransition) {
		throw new Error('Editing conditions of nonexistent transition');
	}

	let conditions = editingTransition ? [...editingTransition.conditions] : [],
		originalConditions = [...conditions],
		freeInput: HTMLInputElement;

	const dispatcher = createEventDispatcher<{ close: void }>();

	function save() {
		if (editingTransition) {
			editingTransition.conditions = conditions;
		}

		conditions = [];
		originalConditions = [];
		dispatcher('close');
	}

	function cancel() {
		conditions = [];
		originalConditions = [];
		dispatcher('close');
	}

	function enforceNFACondition(idx: number): (evt: CustomEvent) => void {
		return (evt: CustomEvent) => {
			if ((evt.target as HTMLInputElement).value.length > 1) {
				(evt.target as HTMLInputElement).value = conditions[idx];
			}
		};
	}
</script>

<Modal {opened} on:close={cancel} title="Edit Conditions">
	<Stack>
		<Stack>
			{#if machineType === 'PDA'}
				<Tooltip label="From left to right: input symbol, read stack symbol, stack action (N, P, or p), pushed stack symbol">
					<QuestionMarkCircled size={18} />
				</Tooltip>
			{:else if machineType === 'Turing Machine'}
				<Tooltip label="From left to right: read symbol, write symbol, movement direction (N, R, or L)">
					<QuestionMarkCircled size={18} />
				</Tooltip>
			{/if}
			{#each conditions as _, i}
				<Group style="justify-content: space-between;">
					{#if machineType === 'Auto'}
						<TextInput bind:value={conditions[i]} />
					{:else if machineType === 'DFA' || machineType === 'NFA'}
						<TextInput bind:value={conditions[i]} on:input={enforceNFACondition(i)} />
					{:else if machineType === 'PDA'}
						<PdaConditionInput bind:condition={conditions[i]} />
					{:else if machineType === 'Turing Machine'}
						<TmConditionInput bind:condition={conditions[i]} />
					{/if}
					<CloseButton
						iconSize="xl"
						color="red"
						on:click={() => {
							conditions = [...conditions.slice(0, i), ...conditions.slice(i + 1)];
						}}
					/>
				</Group>
			{/each}
			<Button
				on:click={() => {
					conditions = [...conditions, ''];
				}}>Add Condition</Button
			>
		</Stack>
		<Group>
			<Button on:click={save}>Ok</Button>
			<Tooltip label="Copy to clipboard">
				<Button use={[[clipboard, EPSILON]]}>{EPSILON}</Button>
			</Tooltip>
			<Button on:click={cancel} color="red">Cancel</Button>
		</Group>
	</Stack>
</Modal>
