<script lang="ts">
	import { Group, NativeSelect, TextInput } from '@svelteuidev/core';

	export let condition: string;

	let [readSymbol, writeSymbol, movement] = condition.split(' ');

	$: readSymbol = condition.split(' ')[0];
	$: writeSymbol = condition.split(' ')[1];
	$: movement = condition.split(' ')[2];

	function validateCondition(): boolean {
		return condition === '' || /. . [NRL]/.test(condition);
	}

	function editReadSymbol(evt: CustomEvent): void {
		const input = evt.target as HTMLInputElement;

		if (input.value.length > 1) {
			input.value = readSymbol;
		} else {
			condition = [input.value, writeSymbol, movement].join(' ');
		}
	}

	function editWriteSymbol(evt: CustomEvent): void {
		const input = evt.target as HTMLInputElement;

		if (input.value.length > 1) {
			input.value = writeSymbol;
		} else {
			condition = [readSymbol, input.value, movement].join(' ');
		}
	}

	function editMovement(evt: CustomEvent): void {
		const input = evt.target as HTMLSelectElement;
		condition = [readSymbol, writeSymbol, input.value].join(' ');
	}
</script>

{#if validateCondition()}
	<Group spacing={8}>
		<TextInput style="width: 4ch" value={readSymbol} on:input={editReadSymbol} />
		<TextInput style="width: 4ch" value={writeSymbol} on:input={editWriteSymbol} />
		<NativeSelect
			value={movement}
			data={[
				{ label: 'None', value: 'P' },
				{ label: 'Left', value: 'L' },
				{ label: 'Right', value: 'R' }
			]}
			on:change={editMovement}
		/>
	</Group>
{:else}
	<TextInput bind:value={condition} />
{/if}
