import { truncateToWidth, type Component } from "@earendil-works/pi-tui";

export function workingGoalWidget(message: string): Component {
  return {
    render: (width) => [truncateToWidth(message, width)],
    invalidate() {},
  };
}
