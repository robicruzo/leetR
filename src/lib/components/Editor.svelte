<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { keymap } from '@codemirror/view';
	import { EditorState, Prec } from '@codemirror/state';
	import { HighlightStyle, StreamLanguage, indentUnit, syntaxHighlighting } from '@codemirror/language';
	import { tags as t } from '@lezer/highlight';
	import { indentWithTab } from '@codemirror/commands';
	import { r } from '@codemirror/legacy-modes/mode/r';

	interface Props {
		value: string;
		onchange?: (code: string) => void;
		onrun?: () => void;
		onsubmit?: () => void;
	}

	let { value, onchange, onrun, onsubmit }: Props = $props();

	let host: HTMLDivElement;
	let view: EditorView | undefined;

	/** Replace the document (e.g. "Reset to starter"), without firing onchange loops. */
	export function setValue(code: string) {
		if (view && view.state.doc.toString() !== code) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
		}
	}

	const theme = EditorView.theme({
		'&': { height: '100%', fontSize: '14px', backgroundColor: 'var(--editor-bg)', color: 'var(--text)' },
		'.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
		'.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--muted)', border: 'none' },
		'.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
		'&.cm-focused': { outline: 'none' },
		'.cm-cursor': { borderLeftColor: 'var(--accent)' },
		'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
			backgroundColor: 'var(--selection) !important'
		}
	});

	// Colours come from CSS variables so they follow the light/dark theme.
	const highlight = HighlightStyle.define([
		{ tag: [t.keyword, t.controlKeyword], color: 'var(--syn-keyword)' },
		{ tag: [t.atom, t.bool, t.null], color: 'var(--syn-atom)' },
		{ tag: [t.number], color: 'var(--syn-number)' },
		{ tag: [t.string], color: 'var(--syn-string)' },
		{ tag: [t.comment], color: 'var(--muted)', fontStyle: 'italic' },
		{ tag: [t.operator], color: 'var(--syn-operator)' },
		{ tag: [t.variableName], color: 'var(--text)' }
	]);

	onMount(() => {
		view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: value,
				extensions: [
					basicSetup,
					StreamLanguage.define(r),
					syntaxHighlighting(highlight),
					indentUnit.of('  '),
					EditorState.tabSize.of(2),
					theme,
					Prec.highest(
						keymap.of([
							{ key: 'Mod-Enter', run: () => (onrun?.(), true) },
							{ key: 'Mod-Shift-Enter', run: () => (onsubmit?.(), true) }
						])
					),
					keymap.of([indentWithTab]),
					EditorView.updateListener.of((u) => {
						if (u.docChanged) onchange?.(u.state.doc.toString());
					})
				]
			})
		});
		return () => view?.destroy();
	});
</script>

<div class="editor" bind:this={host}></div>

<style>
	.editor {
		height: 100%;
		overflow: hidden;
	}
</style>
