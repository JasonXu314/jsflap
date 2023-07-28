<script lang="ts">
	import { Menu } from '@svelteuidev/core';
	import { Check, Trash } from 'radix-icons-svelte';
	import { createEventDispatcher } from 'svelte';
	import type { Node } from '../../utils/node';
	import type { Point } from '../../utils/point';

	export let editingNode: Node, menuLocation: Point;
	let start: boolean = editingNode.start,
		end: boolean = editingNode.end;

	const dispatch = createEventDispatcher<{ delete: Node }>();

	$: start = editingNode.start;
	$: end = editingNode.end;
</script>

<Menu style="position: absolute; left: {menuLocation.x}px; top: {menuLocation.y}px;" opened on:close>
	<div slot="control" />
	<Menu.Item icon={Trash} on:click={() => dispatch('delete', editingNode)}>Delete</Menu.Item>
	<Menu.Item
		icon={start ? Check : undefined}
		on:click={() => {
			editingNode.start = !start;
			start = !start;
		}}
	>
		Initial State
	</Menu.Item>
	<Menu.Item
		icon={end ? Check : undefined}
		on:click={() => {
			editingNode.end = !end;
			end = !end;
		}}
	>
		Final State
	</Menu.Item>
</Menu>
