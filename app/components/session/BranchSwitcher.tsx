interface BranchSwitcherProps {
  pathCount: number;
  activePathIndex: number;
  onSwitch: (pathIndex: number) => void;
}

export function BranchSwitcher({ pathCount, activePathIndex, onSwitch }: BranchSwitcherProps) {
  if (pathCount <= 1) return null;

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 my-1 rounded bg-panel border border-edge text-xs">
      <button
        className="text-slate hover:text-ink disabled:opacity-30"
        disabled={activePathIndex === 0}
        onClick={() => onSwitch(activePathIndex - 1)}
        aria-label="Previous path"
      >
        &#9664;
      </button>
      <span className="text-ink font-medium">
        Path {activePathIndex + 1} of {pathCount}
      </span>
      <button
        className="text-slate hover:text-ink disabled:opacity-30"
        disabled={activePathIndex === pathCount - 1}
        onClick={() => onSwitch(activePathIndex + 1)}
        aria-label="Next path"
      >
        &#9654;
      </button>
      {activePathIndex > 0 && (
        <span className="text-slate ml-1">(alternate history)</span>
      )}
    </div>
  );
}
