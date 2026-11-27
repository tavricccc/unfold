/** What a lesson widget exposes so "next", replay and reset work across every widget kind. */
export interface WidgetHandle {
  busy(): boolean;
  finish(): void;
  replay?(): void;
  reset?(): void;
}

export interface WidgetProps {
  step: number;
  /** true when the learner moved exactly one step forward: play the transition */
  animate: boolean;
  /** notified when the learner manually changed interactive state away from the step's target */
  onDirtyChange?: (dirty: boolean) => void;
}
