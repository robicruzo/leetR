// Convert webR's `toJs()` output (a tree of {type, names, values}) into plain
// JS values. Rules, chosen to fit the shapes grader.R returns:
//   - named list        -> object
//   - unnamed list      -> array
//   - NULL              -> null
//   - atomic, length 1  -> scalar (NA -> null)
//   - atomic, longer    -> array

interface RNode {
	type: string;
	names?: (string | null)[] | null;
	values?: unknown[];
}

export function toPlain(node: unknown): unknown {
	if (node === null || typeof node !== 'object' || !('type' in node)) return node;
	const n = node as RNode;
	if (n.type === 'null') return null;
	if (n.type === 'list' || n.type === 'pairlist') {
		const values = (n.values ?? []).map(toPlain);
		if (n.names && n.names.some((x) => x)) {
			return Object.fromEntries(values.map((v, i) => [n.names![i] ?? String(i), v]));
		}
		return values;
	}
	if (Array.isArray(n.values)) {
		return n.values.length === 1 && !n.names ? n.values[0] : n.values;
	}
	return node;
}
