import { tool } from '@langchain/core/tools';
import toolExecutionRepository from '../agent/toolExecution.repository.js';
import logger from '../../../shared/logger/index.js';

const MAX_OUTPUT_CHARS = 4096;

export function createTool({ name, description, schema, requiredPermission, execute, compensationAction }) {
  return tool(
    async (input, config) => {
      const { permissions = [], userId, agentRunId } = config?.configurable || {};

      if (requiredPermission && !permissions.includes(requiredPermission)) {
        throw new Error(`RBAC_DENIED: Missing permission '${requiredPermission}'`);
      }

      const startTime = Date.now();
      let toolExec;

      if (agentRunId) {
        toolExec = await toolExecutionRepository.create({
          agentRunId,
          toolName: name,
          input,
          status: 'PENDING',
          compensationAction,
        });
      }

      try {
        const output = await execute(input, { userId, permissions, agentRunId });
        const rawJson = JSON.stringify(output);
        const capped = rawJson.length > MAX_OUTPUT_CHARS
          ? rawJson.slice(0, MAX_OUTPUT_CHARS) + '...[TRUNCATED]'
          : rawJson;

        if (toolExec) {
          await toolExecutionRepository.updateById(toolExec._id, {
            output,
            status: 'SUCCESS',
            durationMs: Date.now() - startTime,
          });
        }

        logger.info('Tool executed', {
          module: 'ai-agent',
          action: 'tool.execute',
          tool: name,
          agentRunId,
          durationMs: Date.now() - startTime,
        });
        return capped;
      } catch (err) {
        if (toolExec) {
          await toolExecutionRepository.updateById(toolExec._id, {
            status: 'FAILED',
            errorMessage: err.message,
            durationMs: Date.now() - startTime,
          });
        }
        throw err;
      }
    },
    { name, description, schema }
  );
}
