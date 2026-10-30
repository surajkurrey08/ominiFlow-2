"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { useBuilder } from "@/components/flow/builder-context";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const { onDeleteEdge } = useBuilder();

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 2.5 : 2,
          stroke: selected ? "#3b82f6" : "#94a3b8",
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteEdge?.(id);
            }}
            title="Delete this connection line"
            className={`group/btn flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-all duration-150 cursor-pointer ${
              selected
                ? "bg-rose-600 text-white border-rose-700 scale-110 ring-2 ring-rose-200"
                : "bg-white text-slate-400 border-slate-300 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-400 hover:scale-110"
            }`}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

