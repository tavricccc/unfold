/** What a lesson widget exposes so "next" can finish a running animation instead of skipping it. */
export interface WidgetHandle {
  busy(): boolean;
  finish(): void;
}

export interface WidgetProps {
  step: number;
  /** true when the learner moved exactly one step forward: play the transition */
  animate: boolean;
}
