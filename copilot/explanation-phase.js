const { withModelRetry } = require("./model-retry");
const { resolveMaxModelApiAttempts } = require("./model-config");

async function generateExplanation(session, question, diagramSummary) {
  const prompt = diagramSummary ? `${question}\n\n[Diagram context: ${diagramSummary}]` : question;

  await withModelRetry(session.explanationAgent, {
    signal: session.getTurnSignal(),
    maxAttempts: resolveMaxModelApiAttempts(session.getCopilotConfig()),
    runAttempt: async (attempt) => {
      if (attempt === 1) await session.explanationAgent.prompt(prompt);
      else await session.explanationAgent.continue();
    },
  });
}

module.exports = { generateExplanation };
