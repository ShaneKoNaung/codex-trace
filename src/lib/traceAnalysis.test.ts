import { describe, expect, it } from "vitest";
import type { CodexToolCall, CodexTurn, TurnSummary } from "../../shared/types";
import {
  analyzeSession,
  analyzeTurn,
  isEffectiveToolFailure,
  semanticToolInfo,
} from "./traceAnalysis";

function tool(overrides: Partial<CodexToolCall> = {}): CodexToolCall {
  return {
    call_id: "call-1",
    kind: "exec_command",
    name: "exec",
    arguments: {},
    input_text: null,
    output: "ok",
    exit_code: 0,
    command: ["echo", "ok"],
    cwd: "/tmp",
    duration_secs: 1,
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
    ...overrides,
  };
}

function turn(tools: CodexToolCall[], durationMs = 100_000): CodexTurn {
  return {
    turn_id: "turn-1",
    started_at: 1,
    completed_at: 101,
    duration_ms: durationMs,
    status: "complete",
    user_message: "do it",
    agent_messages: [],
    tool_calls: tools,
    final_answer: null,
    total_tokens: null,
    model: null,
    cwd: null,
    reasoning_effort: null,
    error: null,
    has_compaction: false,
    thread_name: null,
    collab_spawns: [],
    trace_id: null,
    forked_from_thread_id: null,
    compaction_meta: null,
  };
}

function summary(overrides: Partial<TurnSummary> = {}): TurnSummary {
  return {
    turn_id: "turn-1",
    status: "complete",
    started_at: 10,
    completed_at: 20,
    duration_ms: 10_000,
    user_message: "do it",
    agent_preview: "done",
    last_agent_timestamp: null,
    tool_call_count: 2,
    reasoning_count: 3,
    total_tokens: 100,
    model: "gpt",
    has_detail: true,
    ...overrides,
  };
}

describe("semanticToolInfo", () => {
  it("names KiCad DRC instead of showing a generic exec label", () => {
    const info = semanticToolInfo(
      tool({ command: ["kicad-cli-nightly", "pcb", "drc", "board.kicad_pcb"] }),
    );
    expect(info.label).toBe("Run KiCad DRC");
    expect(info.category).toBe("verify");
  });

  it("names patch calls from their operation", () => {
    const info = semanticToolInfo(
      tool({
        kind: "patch_apply",
        name: "apply_patch",
        patch_changes: { "src/App.tsx": { type: "update" } },
      }),
    );
    expect(info).toMatchObject({ label: "Edit files", detail: "src/App.tsx", category: "edit" });
  });
});

describe("isEffectiveToolFailure", () => {
  it("detects an inner failure even when the wrapper exit code is zero", () => {
    expect(
      isEffectiveToolFailure(tool({ output: "Script failed: apply_patch verification failed" })),
    ).toBe(true);
  });
});

describe("analyzeTurn", () => {
  it("separates recorded tool runtime from orchestration time and groups activity", () => {
    const analysis = analyzeTurn(
      turn([
        tool({ command: ["rg", "needle", "src"] }),
        tool({ call_id: "call-2", command: ["npm", "test"], duration_secs: 4 }),
      ]),
    );
    expect(analysis.toolDurationMs).toBe(5000);
    expect(analysis.orchestrationMs).toBe(95_000);
    expect(analysis.toolTimingComplete).toBe(true);
    expect(analysis.groups.map((group) => group.label)).toEqual(["Run tests", "Inspect files"]);
    expect(analysis.findings[0]).toContain("5.0%");
  });

  it("does not attribute unrecorded tool time to model orchestration", () => {
    const analysis = analyzeTurn(turn([tool({ duration_secs: null })]));
    expect(analysis.toolTimingComplete).toBe(false);
    expect(analysis.findings).not.toContain(
      expect.stringContaining("model generation and orchestration"),
    );
  });
});

describe("analyzeSession", () => {
  it("computes timings and uses the latest cumulative token total", () => {
    const analysis = analyzeSession([
      summary(),
      summary({
        turn_id: "turn-2",
        started_at: 30,
        completed_at: 40,
        duration_ms: 10_000,
        tool_call_count: 4,
        reasoning_count: 5,
        total_tokens: 200,
      }),
    ]);
    expect(analysis).toEqual({
      wallClockMs: 30_000,
      activeMs: 20_000,
      idleMs: 10_000,
      toolCallCount: 6,
      reasoningCount: 8,
      totalTokens: 200,
    });
  });
});
