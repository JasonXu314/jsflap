<script lang="ts">
	import { Button, Group, Modal, Stack, TextInput } from '@svelteuidev/core';
	import { createEventDispatcher } from 'svelte';
	import type { Node } from '../../utils/node';

	export let opened: boolean, editingNode: Node | null;

	if (opened && !editingNode) {
		throw new Error('Editing conditions of nonexistent transition');
	}

	let label = editingNode ? editingNode.label : '',
		originalLabel = label;

	const dispatcher = createEventDispatcher<{ close: void }>();

	function save() {
		if (editingNode) {
			editingNode.label = label;
		}

		label = '';
		originalLabel = '';
		dispatcher('close');
	}

	function cancel() {
		label = '';
		originalLabel = '';
		dispatcher('close');
	}
</script>

<Modal {opened} on:close={cancel} title="Edit Conditions">
	<Stack>
		<TextInput label="Node Label" bind:value={label} />
		<Group>
			<Button on:click={save}>Ok</Button>
			<Button on:click={cancel} color="red">Cancel</Button>
		</Group>
	</Stack>
</Modal>
