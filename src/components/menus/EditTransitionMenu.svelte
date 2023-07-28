<script lang="ts">
	import { Menu } from '@svelteuidev/core';
	import { Loop, Pencil2, Trash } from 'radix-icons-svelte';
	import { createEventDispatcher } from 'svelte';
	import type { Point } from '../../utils/point';
	import type { Transition } from '../../utils/transition';

	export let editingTransition: Transition, menuLocation: Point, findDoppel: (transition: Transition) => Transition | null;

	const dispatch = createEventDispatcher<{ delete: Transition; editConditions: Transition }>();
</script>

<Menu style="position: absolute; left: {menuLocation.x}px; top: {menuLocation.y}px;" opened on:close>
	<div slot="control" />
	<Menu.Item icon={Pencil2} on:click={() => dispatch('editConditions', editingTransition)}>Edit Conditions</Menu.Item>
	<Menu.Item icon={Trash} on:click={() => dispatch('delete', editingTransition)}>Delete</Menu.Item>
	<Menu.Item
		icon={Loop}
		on:click={() => {
			let doppel;
			if ((doppel = findDoppel(editingTransition))) {
				const temp = editingTransition.to;
				editingTransition.to = editingTransition.from;
				editingTransition.from = temp;

				const dTemp = doppel.to;
				doppel.to = doppel.from;
				doppel.from = dTemp;
			} else {
				const temp = editingTransition.to;
				editingTransition.to = editingTransition.from;
				editingTransition.from = temp;
			}
		}}>Reverse Direction</Menu.Item
	>
</Menu>
