<script lang="ts">
	import { Group, NativeSelect, TextInput } from '@svelteuidev/core';

	export let condition: string;

	let [symbol, readStackSymbol, action, actionStackSymbol] = condition.split(' ');

	$: symbol = condition.split(' ')[0];
	$: readStackSymbol = condition.split(' ')[1];
	$: action = condition.split(' ')[2];
	$: actionStackSymbol = condition.split(' ')[3];

	function validateCondition(): boolean {
		return condition === '' || /. . [NPp] ./.test(condition);
	}

	function editSymbol(evt: CustomEvent): void {
		const input = evt.target as HTMLInputElement;

		if (input.value.length > 1) {
			input.value = symbol;
		} else {
			condition = [input.value, readStackSymbol, action, actionStackSymbol].join(' ');
		}
	}

	function editReadSymbol(evt: CustomEvent): void {
		const input = evt.target as HTMLInputElement;

		if (input.value.length > 1) {
			input.value = readStackSymbol;
		} else {
			condition = [symbol, input.value, action, actionStackSymbol].join(' ');
		}
	}

	function editAction(evt: CustomEvent): void {
		const input = evt.target as HTMLSelectElement;

		if (input.value !== 'P') {
			condition = [symbol, readStackSymbol, input.value, ''].join(' ');
		} else {
			condition = [symbol, readStackSymbol, input.value, actionStackSymbol].join(' ');
		}
	}

	function editActionSymbol(evt: CustomEvent): void {
		const input = evt.target as HTMLInputElement;

		if (input.value.length > 1) {
			input.value = actionStackSymbol;
		} else {
			condition = [symbol, readStackSymbol, action, input.value].join(' ');
		}
	}
</script>

{#if validateCondition()}
	<Group spacing={8}>
		<TextInput style="width: 4ch" value={symbol} on:input={editSymbol} />
		<TextInput style="width: 4ch" value={readStackSymbol} on:input={editReadSymbol} />
		<NativeSelect
			value={action}
			data={[
				{ label: 'Push', value: 'P' },
				{ label: 'Pop', value: 'p' }
			]}
			on:change={editAction}
		/>
		<TextInput style="width: 4ch" value={actionStackSymbol} on:input={editActionSymbol} />
	</Group>
{:else}
	<TextInput bind:value={condition} />
{/if}
