// Editor helpers for pipelines: indent after a pipe, and insert one.
//
// The legacy R mode only indents inside brackets, so Enter after `x |>`
// started the next line at column 0. This indentation service runs first:
//
//   penguins |>                 a line ending in |>, %>% or + continues the
//     filter(x > 1) |>          expression: indent one unit past the line
//     summarise(                where the expression started;
//       n = n()                 (brackets are left to the R mode)
//     )
//   next_thing                  after the last step of a pipeline, go back
//                               to the start line's indentation.

import { EditorSelection, type Extension, Prec } from '@codemirror/state';
import { getIndentUnit, indentService, type IndentContext } from '@codemirror/language';
import type { Command } from '@codemirror/view';

/** Ends with a pipe or ggplot's +, ignoring trailing spaces and comments. */
const CONTINUES = /(\|>|%>%|\+)\s*(#.*)?$/;

/** Remove strings and comments, so brackets inside them don't count. */
function code(text: string): string {
	return text
		.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`/g, '""')
		.replace(/#.*$/, '');
}

function bracketBalance(text: string): number {
	let n = 0;
	for (const ch of code(text)) {
		if (ch === '(' || ch === '[' || ch === '{') n++;
		else if (ch === ')' || ch === ']' || ch === '}') n--;
	}
	return n;
}

/**
 * The line an expression started on, given its last line. Walk up while the
 * line above ends with a pipe, or while the lines so far close a bracket that
 * was opened higher up.
 */
function expressionStart(cx: IndentContext, line: { text: string; from: number }) {
	let start = line;
	let balance = bracketBalance(line.text);
	while (start.from > 0) {
		const above = cx.lineAt(start.from - 1, -1);
		if (!(balance < 0 || CONTINUES.test(code(above.text)))) break;
		balance += bracketBalance(above.text);
		start = above;
	}
	return start;
}

const pipeIndentService = indentService.of((cx, pos) => {
	// The line above the one being indented (Enter simulates a break at pos).
	let prev = cx.lineAt(pos, -1);
	if (prev.from === pos) {
		if (pos === 0) return undefined;
		prev = cx.lineAt(pos - 1, -1);
	}
	const start = expressionStart(cx, prev);
	const unit = getIndentUnit(cx.state);
	if (CONTINUES.test(code(prev.text))) return cx.lineIndent(start.from, -1) + unit;
	// The pipeline just ended (its brackets are balanced): back to its start.
	if (start.from !== prev.from && bracketBalance(prev.text) <= 0) {
		const opened = bracketBalance(cx.state.sliceDoc(start.from, prev.from + prev.text.length));
		if (opened === 0) return cx.lineIndent(start.from, -1);
	}
	return undefined; // let the R mode decide (brackets, plain lines)
});

export const pipeIndent: Extension = Prec.high(pipeIndentService);

/** Insert " |> " at each cursor, without doubling spaces. */
export const insertPipe: Command = (view) => {
	view.dispatch(
		view.state.changeByRange((range) => {
			const before = view.state.sliceDoc(Math.max(0, range.from - 1), range.from);
			const after = view.state.sliceDoc(range.to, range.to + 1);
			const text = (before === '' || /\s/.test(before) ? '' : ' ') + '|>' + (after === ' ' ? '' : ' ');
			const end = range.from + text.length + (after === ' ' ? 1 : 0);
			return {
				changes: { from: range.from, to: range.to, insert: text },
				range: EditorSelection.cursor(end)
			};
		}),
		{ scrollIntoView: true, userEvent: 'input' }
	);
	return true;
};
