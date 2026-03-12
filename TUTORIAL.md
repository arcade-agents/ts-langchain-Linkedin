---
title: "Build a Linkedin agent with LangChain (TypeScript) and Arcade"
slug: "ts-langchain-Linkedin"
framework: "langchain-ts"
language: "typescript"
toolkits: ["Linkedin"]
tools: []
difficulty: "beginner"
generated_at: "2026-03-12T01:34:22Z"
source_template: "ts_langchain"
agent_repo: ""
tags:
  - "langchain"
  - "typescript"
  - "linkedin"
---

# Build a Linkedin agent with LangChain (TypeScript) and Arcade

In this tutorial you'll build an AI agent using [LangChain](https://js.langchain.com/) with [LangGraph](https://langchain-ai.github.io/langgraphjs/) in TypeScript and [Arcade](https://arcade.dev) that can interact with Linkedin tools — with built-in authorization and human-in-the-loop support.

## Prerequisites

- The [Bun](https://bun.com) runtime
- An [Arcade](https://arcade.dev) account and API key
- An OpenAI API key

## Project Setup

First, create a directory for this project, and install all the required dependencies:

````bash
mkdir linkedin-agent && cd linkedin-agent
bun install @arcadeai/arcadejs @langchain/langgraph @langchain/core langchain chalk
````

## Start the agent script

Create a `main.ts` script, and import all the packages and libraries. Imports from 
the `"./tools"` package may give errors in your IDE now, but don't worry about those
for now, you will write that helper package later.

````typescript
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
````

## Configuration

In `main.ts`, configure your agent's toolkits, system prompt, and model. Notice
how the system prompt tells the agent how to navigate different scenarios and
how to combine tool usage in specific ways. This prompt engineering is important
to build effective agents. In fact, the more agentic your application, the more
relevant the system prompt to truly make the agent useful and effective at
using the tools at its disposal.

````typescript
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
````

Set the following environment variables in a `.env` file:

````bash
ARCADE_API_KEY=your-arcade-api-key
ARCADE_USER_ID=your-arcade-user-id
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
````

## Implementing the `tools.ts` module

The `tools.ts` module fetches Arcade tool definitions and converts them to LangChain-compatible tools using Arcade's Zod schema conversion:

### Create the file and import the dependencies

Create a `tools.ts` file, and add import the following. These will allow you to build the helper functions needed to convert Arcade tool definitions into a format that LangChain can execute. Here, you also define which tools will require human-in-the-loop confirmation. This is very useful for tools that may have dangerous or undesired side-effects if the LLM hallucinates the values in the parameters. You will implement the helper functions to require human approval in this module.

````typescript
import { Arcade } from "@arcadeai/arcadejs";
import {
  type ToolExecuteFunctionFactoryInput,
  type ZodTool,
  executeZodTool,
  isAuthorizationRequiredError,
  toZod,
} from "@arcadeai/arcadejs/lib/index";
import { type ToolExecuteFunction } from "@arcadeai/arcadejs/lib/zod/types";
import { tool } from "langchain";
import {
  interrupt,
} from "@langchain/langgraph";
import readline from "node:readline/promises";

// This determines which tools require human in the loop approval to run
const TOOLS_WITH_APPROVAL = ['Linkedin_CreateTextPost'];
````

### Create a confirmation helper for human in the loop

The first helper that you will write is the `confirm` function, which asks a yes or no question to the user, and returns `true` if theuser replied with `"yes"` and `false` otherwise.

````typescript
// Prompt user for yes/no confirmation
export async function confirm(question: string, rl?: readline.Interface): Promise<boolean> {
  let shouldClose = false;
  let interface_ = rl;

  if (!interface_) {
      interface_ = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
      });
      shouldClose = true;
  }

  const answer = await interface_.question(`${question} (y/n): `);

  if (shouldClose) {
      interface_.close();
  }

  return ["y", "yes"].includes(answer.trim().toLowerCase());
}
````

Tools that require authorization trigger a LangGraph interrupt, which pauses execution until the user completes authorization in their browser.

### Create the execution helper

This is a wrapper around the `executeZodTool` function. Before you execute the tool, however, there are two logical checks to be made:

1. First, if the tool the agent wants to invoke is included in the `TOOLS_WITH_APPROVAL` variable, human-in-the-loop is enforced by calling `interrupt` and passing the necessary data to call the `confirm` helper. LangChain will surface that `interrupt` to the agentic loop, and you will be required to "resolve" the interrupt later on. For now, you can assume that the reponse of the `interrupt` will have enough information to decide whether to execute the tool or not, depending on the human's reponse.
2. Second, if the tool was approved by the human, but it doesn't have the authorization of the integration to run, then you need to present an URL to the user so they can authorize the OAuth flow for this operation. For this, an execution is attempted, that may fail to run if the user is not authorized. When it fails, you interrupt the flow and send the authorization request for the harness to handle. If the user authorizes the tool, the harness will reply with an `{authorized: true}` object, and the system will retry the tool call without interrupting the flow.

````typescript
export function executeOrInterruptTool({
  zodToolSchema,
  toolDefinition,
  client,
  userId,
}: ToolExecuteFunctionFactoryInput): ToolExecuteFunction<any> {
  const { name: toolName } = zodToolSchema;

  return async (input: unknown) => {
    try {

      // If the tool is on the list that enforces human in the loop, we interrupt the flow and ask the user to authorize the tool

      if (TOOLS_WITH_APPROVAL.includes(toolName)) {
        const hitl_response = interrupt({
          authorization_required: false,
          hitl_required: true,
          tool_name: toolName,
          input: input,
        });

        if (!hitl_response.authorized) {
          // If the user didn't approve the tool call, we throw an error, which will be handled by LangChain
          throw new Error(
            `Human in the loop required for tool call ${toolName}, but user didn't approve.`
          );
        }
      }

      // Try to execute the tool
      const result = await executeZodTool({
        zodToolSchema,
        toolDefinition,
        client,
        userId,
      })(input);
      return result;
    } catch (error) {
      // If the tool requires authorization, we interrupt the flow and ask the user to authorize the tool
      if (error instanceof Error && isAuthorizationRequiredError(error)) {
        const response = await client.tools.authorize({
          tool_name: toolName,
          user_id: userId,
        });

        // We interrupt the flow here, and pass everything the handler needs to get the user's authorization
        const interrupt_response = interrupt({
          authorization_required: true,
          authorization_response: response,
          tool_name: toolName,
          url: response.url ?? "",
        });

        // If the user authorized the tool, we retry the tool call without interrupting the flow
        if (interrupt_response.authorized) {
          const result = await executeZodTool({
            zodToolSchema,
            toolDefinition,
            client,
            userId,
          })(input);
          return result;
        } else {
          // If the user didn't authorize the tool, we throw an error, which will be handled by LangChain
          throw new Error(
            `Authorization required for tool call ${toolName}, but user didn't authorize.`
          );
        }
      }
      throw error;
    }
  };
}
````

### Create the tool retrieval helper

The last helper function of this module is the `getTools` helper. This function will take the configurations you defined in the `main.ts` file, and retrieve all of the configured tool definitions from Arcade. Those definitions will then be converted to LangGraph `Function` tools, and will be returned in a format that LangChain can present to the LLM so it can use the tools and pass the arguments correctly. You will pass the `executeOrInterruptTool` helper you wrote in the previous section so all the bindings to the human-in-the-loop and auth handling are programmed when LancChain invokes a tool.


````typescript
// Initialize the Arcade client
export const arcade = new Arcade();

export type GetToolsProps = {
  arcade: Arcade;
  toolkits?: string[];
  tools?: string[];
  userId: string;
  limit?: number;
}


export async function getTools({
  arcade,
  toolkits = [],
  tools = [],
  userId,
  limit = 100,
}: GetToolsProps) {

  if (toolkits.length === 0 && tools.length === 0) {
      throw new Error("At least one tool or toolkit must be provided");
  }

  // Todo(Mateo): Add pagination support
  const from_toolkits = await Promise.all(toolkits.map(async (tkitName) => {
      const definitions = await arcade.tools.list({
          toolkit: tkitName,
          limit: limit
      });
      return definitions.items;
  }));

  const from_tools = await Promise.all(tools.map(async (toolName) => {
      return await arcade.tools.get(toolName);
  }));

  const all_tools = [...from_toolkits.flat(), ...from_tools];
  const unique_tools = Array.from(
      new Map(all_tools.map(tool => [tool.qualified_name, tool])).values()
  );

  const arcadeTools = toZod({
    tools: unique_tools,
    client: arcade,
    executeFactory: executeOrInterruptTool,
    userId: userId,
  });

  // Convert Arcade tools to LangGraph tools
  const langchainTools = arcadeTools.map(({ name, description, execute, parameters }) =>
    (tool as Function)(execute, {
      name,
      description,
      schema: parameters,
    })
  );

  return langchainTools;
}
````

## Building the Agent

Back on the `main.ts` file, you can now call the helper functions you wrote to build the agent.

### Retrieve the configured tools

Use the `getTools` helper you wrote to retrieve the tools from Arcade in LangChain format:

````typescript
const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});
````

### Write an interrupt handler

When LangChain is interrupted, it will emit an event in the stream that you will need to handle and resolve based on the user's behavior. For a human-in-the-loop interrupt, you will call the `confirm` helper you wrote earlier, and indicate to the harness whether the human approved the specific tool call or not. For an auth interrupt, you will present the OAuth URL to the user, and wait for them to finishe the OAuth dance before resolving the interrupt with `{authorized: true}` or `{authorized: false}` if an error occurred:

````typescript
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
````

### Create an Agent instance

Here you create the agent using the `createAgent` function. You pass the system prompt, the model, the tools, and the checkpointer. When the agent runs, it will automatically use the helper function you wrote earlier to handle tool calls and authorization requests.

````typescript
const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});
````

### Write the invoke helper

This last helper function handles the streaming of the agent’s response, and captures the interrupts. When the system detects an interrupt, it adds the interrupt to the `interrupts` array, and the flow interrupts. If there are no interrupts, it will just stream the agent’s to your console.

````typescript
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
````

### Write the main function

Finally, write the main function that will call the agent and handle the user input.

Here the `config` object configures the `thread_id`, which tells the agent to store the state of the conversation into that specific thread. Like any typical agent loop, you:

1. Capture the user input
2. Stream the agent's response
3. Handle any authorization interrupts
4. Resume the agent after authorization
5. Handle any errors
6. Exit the loop if the user wants to quit

````typescript
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
````

## Running the Agent

### Run the agent

```bash
bun run main.ts
```

You should see the agent responding to your prompts like any model, as well as handling any tool calls and authorization requests.

## Next Steps

- Clone the [repository](https://github.com/arcade-agents/ts-langchain-Linkedin) and run it
- Add more toolkits to the `toolkits` array to expand capabilities
- Customize the `systemPrompt` to specialize the agent's behavior
- Explore the [Arcade documentation](https://docs.arcade.dev) for available toolkits

