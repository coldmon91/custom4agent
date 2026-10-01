export interface CollapsedCommand {
	firstLine: string;
	hiddenLineCount: number;
}

/**
 * Reduces a shell command to its first meaningful line plus the number of lines left out.
 * Blank lines at either end are ignored so a trailing newline is not reported as hidden content.
 */
export function collapseCommand(command: string): CollapsedCommand {
	const lines = command.replace(/\r\n?/g, "\n").split("\n");
	let start = 0;
	let end = lines.length;
	while (start < end - 1 && lines[start].trim() === "") start++;
	while (end - 1 > start && lines[end - 1].trim() === "") end--;
	return { firstLine: lines[start], hiddenLineCount: end - start - 1 };
}
