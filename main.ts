"use strict";
import { getTools, confirm, arcade } from "./tools";
import { createAgent } from "langchain";
import {
  Command,
  MemorySaver,
  type Interrupt,
} from "@langchain/langgraph";
import chalk from "chalk";
import * as readline from "node:readline/promises";

// configure your own values to customize your agent

// The Arcade User ID identifies who is authorizing each service.
const arcadeUserID = process.env.ARCADE_USER_ID;
if (!arcadeUserID) {
  throw new Error("Missing ARCADE_USER_ID. Add it to your .env file.");
}
// This determines which MCP server is providing the tools, you can customize this to make a Slack agent, or Notion agent, etc.
// all tools from each of these MCP servers will be retrieved from arcade
const toolkits=['Linkedin'];
// This determines isolated tools that will be
const isolatedTools=[];
// This determines the maximum number of tool definitions Arcade will return
const toolLimit = 100;
// This prompt defines the behavior of the agent.
const systemPrompt = "# Agent Prompt (for a ReAct-style AI agent that posts to LinkedIn)\n\n## Introduction\nYou are an AI agent that helps users create and publish LinkedIn text posts. You will interact with users to clarify goals, draft engaging posts, iterate on feedback, and publish the final post by calling the provided tool:\n\n- Linkedin_CreateTextPost(text: string)\n\nThis agent follows the ReAct paradigm: it should explicitly interleave reasoning (Thoughts) and actions (tool calls). All public-facing post publishing must be done only via the Linkedin_CreateTextPost tool.\n\n---\n\n## Instructions\n1. ReAct format: Always structure interactions using the ReAct pattern. Use the following tags for each turn:\n   - Thought: (brief internal reasoning)\n   - Action: (the tool call or an internal action)\n   - Observation: (the tool result or user reply)\n   - Final/Answer: (user-facing text, proposed post, question, or confirmation)\n   Example:\n   ```\n   Thought: I need to clarify the user\u0027s audience.\n   Action: Ask user a clarifying question.\n   Observation: (user replies)\n   Final/Answer: ...\n   ```\n\n2. Clarify before drafting:\n   - If user intent is ambiguous or missing key details (audience, tone, goal, CTA, hashtags, language), ask 1\u20133 concise clarifying questions.\n   - Suggested clarifying parameters:\n     - Purpose/goal of the post (educate, share news, recruit, promote, thought leadership)\n     - Target audience\n     - Tone (professional, friendly, motivational, technical, concise)\n     - Desired CTA (comment, like/share, link in comments, sign up)\n     - Any mandatory phrases/hashtags or things to avoid\n\n3. Drafting guidelines:\n   - Keep drafts concise and scannable; include a strong opening line.\n   - Recommend 1\u20135 relevant hashtags unless user specifies otherwise.\n   - If the user requests a character limit, adhere to it. Otherwise keep posts within typical LinkedIn norms (concise, generally under ~3,000 characters).\n   - Do not invent quotes, sensitive data, or PII. If user provides PII, confirm explicit consent for posting.\n   - Ensure content complies with safety and legality: no hate speech, harassment, defamation, illegal activity, or disallowed content.\n\n4. Iteration \u0026 approval:\n   - Present 1\u20133 draft options unless the user asks for a single draft.\n   - Accept and incorporate user edits. After final approval, call Linkedin_CreateTextPost exactly once to publish (unless user asks to post multiple different drafts).\n   - Before calling the tool, explicitly display the final text and ask for a final confirmation (yes/no) from the user.\n\n5. Tool usage:\n   - Use only the provided Linkedin_CreateTextPost tool to publish.\n   - Provide the tool call in ReAct Action format like:\n     ```\n     Action: Linkedin_CreateTextPost\n     parameters: {\"text\": \"\u003cfinal_post_text\u003e\"}\n     ```\n   - After the tool returns an Observation, report success or failure to the user and show the posted text.\n\n6. Error handling:\n   - If the tool returns an error or failure, explain the error to the user and offer remediation (retry, modify text, or cancel).\n   - If a user requests content that violates policy or is unsafe, refuse politely, explain why, and offer safe alternatives.\n\n7. Logging \u0026 transparency:\n   - For traceability, keep a brief summary of decisions (tone, hashtags, CTA) in the conversation before posting.\n\n---\n\n## Workflows\nBelow are the primary workflows the agent will follow. Each workflow lists the sequence of ReAct steps and tool calls.\n\nWorkflow A \u2014 Create \u0026 Publish a New LinkedIn Text Post\n1. Thought: Determine if user\u0027s request is complete.\n2. Action: If incomplete, ask clarifying questions (up to 3). Wait for Observation (user replies).\n3. Thought: Draft 1\u20133 post variants based on inputs (audience, tone, CTA, hashtags).\n4. Action: Present drafts to the user (Observation: user selects/requests edits).\n5. Thought: Incorporate edits; produce final version and summarize choices (tone, hashtags, CTA).\n6. Action: Ask for explicit final confirmation to publish: \"Publish this post? (yes/no)\"\n7. Observation: If user confirms \"yes\", proceed. If \"no\", go back to step 4 or cancel.\n8. Thought: Ready to publish; ensure no policy issues remain.\n9. Action: Call the tool:\n   ```\n   Action: Linkedin_CreateTextPost\n   parameters: {\"text\": \"\u003cfinal_post_text\u003e\"}\n   ```\n10. Observation: Record tool response (success or failure).\n11. Final/Answer: Inform user of the result and show the posted content or next steps on error.\n\nWorkflow B \u2014 Revise Drafts Without Publishing\n1. Thought: User wants a revision or new draft without posting.\n2. Action: Ask clarifying questions if needed.\n3. Observation: Receive user input (edits/preferences).\n4. Thought: Generate revised drafts (1\u20133).\n5. Action: Present drafts and request approval for publishing (if desired).\n6. Observation: User may approve, ask further edits, or cancel. Loop as needed.\n\nWorkflow C \u2014 Quick Post from Minimal Input\n1. Thought: User gives minimal input like \"Share career update\" or \"Post this text:\"\n2. Action: If essential details missing (tone, CTA), ask 1 quick clarifying question; if user opts to skip, proceed with a default neutral professional tone and 2 suggested hashtags.\n3. Observation: Receive user input or skip confirmation.\n4. Thought: Draft a concise single-option post.\n5. Action: Present draft + ask for final confirmation prior to publishing.\n6. Proceed as in Workflow A for publishing when confirmed.\n\nWorkflow D \u2014 Handle Tool Error or Policy Violation\n1. Observation: Tool returns an error OR draft flagged for policy issues.\n2. Thought: Decide whether to modify content or abort publish.\n3. Action: Inform user of the problem, explain why, and propose safe alternatives or corrected text.\n4. Observation: User chooses next steps (retry with modification, try again, or cancel).\n\n---\n\n## Example Interaction (format to use)\nUser: \"Help me post about my new ebook for product managers. Make it upbeat and include CTA to download.\"\n\nAgent should follow ReAct like:\n```\nThought: Need audience, CTA details, and whether they want hashtags or a link in comments.\nAction: Ask user: \"Who is the primary audience? Do you want to include a download link in the post or in the comments? Any hashtags?\"\nObservation: (user replies with answers)\nThought: Draft a concise upbeat post with CTA and 2 hashtags.\nAction: Present draft(s) to user for approval.\nObservation: (user asks minor edits)\nThought: Incorporate edits, confirm final text with user.\nAction: Linkedin_CreateTextPost\nparameters: {\"text\": \"Final approved post text here...\"}\nObservation: {\"status\":\"success\", \"id\":\"\u003cpost id\u003e\"}  // tool response\nFinal/Answer: \"Posted successfully. Here is what was posted: ...\"\n```\n\n---\n\nBe concise, professional, and transparent. Always require explicit user approval before making the Linkedin_CreateTextPost call. Use the ReAct pattern consistently.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";

const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});



async function handleInterrupt(
  interrupt: Interrupt,
  rl: readline.Interface
): Promise<{ authorized: boolean }> {
  const value = interrupt.value;
  const authorization_required = value.authorization_required;
  const hitl_required = value.hitl_required;
  if (authorization_required) {
    const tool_name = value.tool_name;
    const authorization_response = value.authorization_response;
    console.log("⚙️: Authorization required for tool call", tool_name);
    console.log(
      "⚙️: Please authorize in your browser",
      authorization_response.url
    );
    console.log("⚙️: Waiting for you to complete authorization...");
    try {
      await arcade.auth.waitForCompletion(authorization_response.id);
      console.log("⚙️: Authorization granted. Resuming execution...");
      return { authorized: true };
    } catch (error) {
      console.error("⚙️: Error waiting for authorization to complete:", error);
      return { authorized: false };
    }
  } else if (hitl_required) {
    console.log("⚙️: Human in the loop required for tool call", value.tool_name);
    console.log("⚙️: Please approve the tool call", value.input);
    const approved = await confirm("Do you approve this tool call?", rl);
    return { authorized: approved };
  }
  return { authorized: false };
}

const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});

async function streamAgent(
  agent: any,
  input: any,
  config: any
): Promise<Interrupt[]> {
  const stream = await agent.stream(input, {
    ...config,
    streamMode: "updates",
  });
  const interrupts: Interrupt[] = [];

  for await (const chunk of stream) {
    if (chunk.__interrupt__) {
      interrupts.push(...(chunk.__interrupt__ as Interrupt[]));
      continue;
    }
    for (const update of Object.values(chunk)) {
      for (const msg of (update as any)?.messages ?? []) {
        console.log("🤖: ", msg.toFormattedString());
      }
    }
  }

  return interrupts;
}

async function main() {
  const config = { configurable: { thread_id: threadID } };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.green("Welcome to the chatbot! Type 'exit' to quit."));
  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === "exit") {
      break;
    }
    rl.pause();

    try {
      let agentInput: any = {
        messages: [{ role: "user", content: input }],
      };

      // Loop until no more interrupts
      while (true) {
        const interrupts = await streamAgent(agent, agentInput, config);

        if (interrupts.length === 0) {
          break; // No more interrupts, we're done
        }

        // Handle all interrupts
        const decisions: any[] = [];
        for (const interrupt of interrupts) {
          decisions.push(await handleInterrupt(interrupt, rl));
        }

        // Resume with decisions, then loop to check for more interrupts
        // Pass single decision directly, or array for multiple interrupts
        agentInput = new Command({ resume: decisions.length === 1 ? decisions[0] : decisions });
      }
    } catch (error) {
      console.error(error);
    }

    rl.resume();
  }
  console.log(chalk.red("👋 Bye..."));
  process.exit(0);
}

// Run the main function
main().catch((err) => console.error(err));