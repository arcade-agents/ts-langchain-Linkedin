from arcadepy import AsyncArcade
from dotenv import load_dotenv
from google.adk import Agent, Runner
from google.adk.artifacts import InMemoryArtifactService
from google.adk.models.lite_llm import LiteLlm
from google.adk.sessions import InMemorySessionService, Session
from google_adk_arcade.tools import get_arcade_tools
from google.genai import types
from human_in_the_loop import auth_tool, confirm_tool_usage

import os

load_dotenv(override=True)


async def main():
    app_name = "my_agent"
    user_id = os.getenv("ARCADE_USER_ID")

    session_service = InMemorySessionService()
    artifact_service = InMemoryArtifactService()
    client = AsyncArcade()

    agent_tools = await get_arcade_tools(
        client, toolkits=["Linkedin"]
    )

    for tool in agent_tools:
        await auth_tool(client, tool_name=tool.name, user_id=user_id)

    agent = Agent(
        model=LiteLlm(model=f"openai/{os.environ["OPENAI_MODEL"]}"),
        name="google_agent",
        instruction="# AI Agent Prompt for LinkedIn Post Creation

## Introduction
This AI agent is designed to assist users in crafting and sharing engaging text posts on LinkedIn. By understanding user inputs and utilizing the available tools, the agent will create and publish timely and relevant content tailored for a professional network.

## Instructions
1. **Understand User Intent**: Begin by asking the user what topic or message they would like to share on LinkedIn.
2. **Gather Input**: After clarifying the topic, collect any additional details, such as tone, targeted audience, and any specific key points the user wishes to include.
3. **Compose the Post**: Create a compelling text post based on the gathered information. Ensure it aligns with professional standards and resonates with a LinkedIn audience.
4. **Publish the Post**: Utilize the `Linkedin_CreateTextPost` tool to share the composed text post on LinkedIn.

## Workflows
### Workflow 1: Topic and Message Collection
1. **User Input**: Ask the user what topic they want to share.
2. **Clarification**: Request further details regarding tone, audience, and key points.

### Workflow 2: Post Composition
1. **Create Text**: Based on user input, write a draft for the LinkedIn post.

### Workflow 3: Posting to LinkedIn
1. **Use Tool**: Execute the `Linkedin_CreateTextPost` tool with the composed text to share it on LinkedIn.

By following these workflows, the agent will facilitate a smooth experience for users looking to engage with their professional network on LinkedIn.",
        description="An agent that uses Linkedin tools provided to perform any task",
        tools=agent_tools,
        before_tool_callback=[confirm_tool_usage],
    )

    session = await session_service.create_session(
        app_name=app_name, user_id=user_id, state={
            "user_id": user_id,
        }
    )
    runner = Runner(
        app_name=app_name,
        agent=agent,
        artifact_service=artifact_service,
        session_service=session_service,
    )

    async def run_prompt(session: Session, new_message: str):
        content = types.Content(
            role='user', parts=[types.Part.from_text(text=new_message)]
        )
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=content,
        ):
            if event.content.parts and event.content.parts[0].text:
                print(f'** {event.author}: {event.content.parts[0].text}')

    while True:
        user_input = input("User: ")
        if user_input.lower() == "exit":
            print("Goodbye!")
            break
        await run_prompt(session, user_input)


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())