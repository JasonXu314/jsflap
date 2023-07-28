<script lang="ts">
	import { Button, Checkbox, Modal, Stack, TextInput } from '@svelteuidev/core';
	import { createEventDispatcher } from 'svelte';
	import type { NodeData } from '../../utils/node';

	export let opened: boolean;
	let label: string = '',
		start: boolean = false,
		end: boolean = false,
		element: HTMLInputElement;

	$: {
		if (opened && element) {
			setTimeout(() => {
				const input = element.querySelector('input');
				input!.focus();
			}, 0);
		}
	}

	const dispatcher = createEventDispatcher<{ submit: NodeData; cancel: void }>();
</script>

<Modal {opened} on:close={() => dispatcher('cancel')} title="Create Node">
	<Stack>
		<TextInput label="Label" bind:element bind:value={label} />
		<Checkbox label="Initial State?" bind:checked={start} />
		<Checkbox label="Final State?" bind:checked={end} />
		<Button
			on:click={() => {
				dispatcher('submit', { label, start, end });
				label = '';
				start = false;
				end = false;
			}}>Ok</Button
		>
	</Stack>
</Modal>
