import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CodexToolCall, CodexTurn } from "../../shared/types";
import { TurnInsights } from "./TurnInsights";

function tool(callId: string, command: string[], duration: number): CodexToolCall {
  return {
    call_id: callId,
    kind: "exec_command",
    name: "exec",
    arguments: {},
    input_text: null,
    output: "ok",
    exit_code: 0,
    command,
    cwd: "/tmp",
    duration_secs: duration,
    mcp_server: null,
    mcp_tool: null,
    plugin_id: null,
    script_path: null,
    subagent_id: null,
    subagent_name: null,
    patch_success: null,
    patch_changes: null,
    web_query: null,
    web_url: null,
    image_prompt: null,
    image_file_path: null,
    worker_session: null,
    status: "completed",
    output_truncated: null,
  };
}

describe("TurnInsights", () => {
  it("renders time attribution and semantic activity names", () => {
    const turn = {
      duration_ms: 100_000,
      tool_calls: [
        tool("one", ["rg", "needle", "src"], 1),
        tool("two", ["kicad-cli-nightly", "pcb", "drc", "board.kicad_pcb"], 4),
      ],
    } as CodexTurn;
    render(<TurnInsights turn={turn} />);
    expect(screen.getByText("5.0s")).toBeInTheDocument();
    expect(screen.getByText("1m 35s")).toBeInTheDocument();
    expect(screen.getByText("Run KiCad DRC")).toBeInTheDocument();
    expect(screen.getByText(/Only 5.0%/)).toBeInTheDocument();
  });

  it("marks missing tool timing as unavailable instead of assigning it to orchestration", () => {
    const untimed = tool("one", ["rg", "needle", "src"], 1);
    untimed.duration_secs = null;
    const turn = { duration_ms: 100_000, tool_calls: [untimed] } as CodexTurn;
    render(<TurnInsights turn={turn} />);
    expect(screen.getAllByText("n/a")).toHaveLength(2);
    expect(screen.queryByText("Time attribution")).not.toBeInTheDocument();
    expect(screen.queryByText(/model generation and orchestration/)).not.toBeInTheDocument();
    expect(screen.getByText(/timing unavailable/)).toBeInTheDocument();
  });
});
