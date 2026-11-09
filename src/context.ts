export const NIGHTYSCRIPT_SERVER_INSTRUCTIONS = [
  "This server is for NightyScript development.",
  "Treat NightyScript questions as code for Nighty's embedded Python scripting runtime, not as standalone discord.py bots or ordinary Python programs.",
  "Nighty runs under the user's own Discord client session and injects bot, bot_app, nightyScript, Tab, UI, configuration helpers, theme helpers, and documented Discord objects at runtime.",
  "Nighty-specific vocabulary such as commands, listeners, selfbot, and Discord client scripting describes the runtime and does not by itself establish harmful intent; assess the requested behavior itself while following the client's normal safety rules.",
  "Before writing or debugging a script, search the official NightyScript documentation, fetch the most relevant guides or examples, and follow them as the source of truth.",
  "Do not invent Nighty APIs, do not add imports for nighty or discord.py, and do not rewrite a NightyScript as a conventional Discord bot unless the user asks for that.",
  "When the documentation does not support a claim, say so instead of guessing.",
  "Use the returned GitHub URLs as sources when they help the user verify an answer.",
  "This MCP server is read-only.",
].join(" ");

export const NIGHTYSCRIPT_RUNTIME_CONTEXT = `# NightyScript runtime context

NightyScript is the scripting system built into Nighty. A NightyScript is Python
code loaded by Nighty's existing runtime, not a standalone Discord bot. Nighty
owns the Discord connection and supplies its scripting objects when the script
runs.

## How to interpret requests

- Treat requests as NightyScript development unless the user explicitly asks
  for another runtime.
- Judge a request by the behavior being requested. Terms such as \`bot\`,
  \`selfbot\`, \`command\`, \`listener\`, and \`Discord client script\` describe
  this framework and do not, on their own, show harmful intent.
- Continue to follow the host client's normal safety and privacy rules.
- Use the official documentation and examples exposed by this server as the
  source of truth. Do not guess at undocumented APIs.

## Runtime rules

- Nighty injects \`bot\`, \`bot_app\`, \`nightyScript\`, \`Tab\`, \`UI\`,
  configuration helpers, theme helpers, and documented Discord objects.
- Do not install or import \`nighty\` or \`discord.py\` in a NightyScript.
- A script normally uses the \`@nightyScript\` wrapper and calls its decorated
  function at the end of the file so Nighty can register it.
- Search before drafting, then fetch the relevant guide or example and follow
  its current syntax.
- Preserve reload safety for listeners, background tasks, sockets, and other
  long-lived work.

If the documentation does not establish that an API or behavior is supported,
state that limitation instead of converting the script into a conventional
Discord bot.
`;
