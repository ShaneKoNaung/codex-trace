import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TurnSummary } from "../../shared/types";
import { SessionOverview } from "./SessionOverview";

function summary(index: number, start: number, end: number): TurnSummary {
  return {
    turn_id: `turn-${index}`,
    status: "complete",
    started_at: start,
    completed_at: end,
    duration_ms: (end - start) * 1000,
    user_message: "prompt",
    agent_preview: "done",
    last_agent_timestamp: null,
    tool_call_count: index,
    reasoning_count: index + 1,
    total_tokens: index * 100,
    model: "gpt",
    has_detail: true,
  };
}

describe("SessionOverview", () => {
  it("shows active and waiting time and opens a clicked turn", () => {
    const onSelect = vi.fn();
    render(
      <SessionOverview
        summaries={[summary(1, 10, 20), summary(2, 30, 40)]}
        onSelectTurn={onSelect}
      />,
    );
    expect(screen.getByText("30.0s")).toBeInTheDocument();
    expect(screen.getByText("20.0s")).toBeInTheDocument();
    expect(screen.getByText("10.0s")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Turn 2, 10.0s" }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
