import { tool } from '@langchain/core/tools';
import toolExecutionRepository from '../agent/toolExecution.repository.js';
import logger from '../../../shared/logger/index.js';

const MAX_OUTPUT_CHARS = 4096;
const PERMISSION_ALIASES = Object.freeze({
  'tasks:write': ['tasks:create', 'tasks:update'],
  'notifications:write': ['notifications:send'],
  'field-ticket:write': ['field-service:write', 'field-service:admin'],
});

function hasRequiredPermission(permissions, requiredPermission) {
  if (!requiredPermission) return true;
  if (permissions.includes('*') || permissions.includes(requiredPermission)) return true;
  const aliases = PERMISSION_ALIASES[requiredPermission] || [];
  return aliases.some((alias) => permissions.includes(alias));
}

export function createTool({ name, description, schema, requiredPermission, execute, compensationAction }) {
  return tool(
    async (input, _runManager, config) => {
      // LangChain may pass RunnableConfig as the 2nd arg (direct invoke)
      // or the 3rd arg (tool node execution), so support both.
      const runnableConfig = config?.configurable ? config : _runManager;
      const { permissions = [], userId, agentRunId } = runnableConfig?.configurable || {};

      // '*' wildcard = Admin bypass; aliases keep legacy permission slugs working.
      const hasPermission = hasRequiredPermission(permissions, requiredPermission);
      if (!hasPermission) {
        throw new Error(`RBAC_DENIED: Missing permission '${requiredPermission}'`);
      }

      const startTime = Date.now();
      let toolExec;

      // Fix 3: Wrap ToolExecution create in try/catch so a DB failure does not abort the tool
      if (agentRunId) {
        try {
          toolExec = await toolExecutionRepository.create({
            agentRunId,
            toolName: name,
            input,
            status: 'PENDING',
            compensationAction,
          });
        } catch (dbErr) {
          logger.warn('ToolExecution create failed — proceeding without audit', {
            module: 'ai-agent',
            tool: name,
            error: dbErr.message,
          });
        }
      }

      try {
        const output = await execute(input, { userId, permissions, agentRunId });

        // Fix 2: Capture duration immediately after execute(), before any DB write
        const executionDurationMs = Date.now() - startTime;

        // Fix 1: Produce a valid JSON object when output is too large instead of slicing raw JSON
        const rawJson = JSON.stringify(output);
        let safeOutput = output;
        if (rawJson.length > MAX_OUTPUT_CHARS) {
          safeOutput = {
            _truncated: true,
            _originalLength: rawJson.length,
            summary: rawJson.slice(0, MAX_OUTPUT_CHARS),
          };
        }
        const capped = JSON.stringify(safeOutput);

        if (toolExec) {
          await toolExecutionRepository.updateById(toolExec._id, {
            output,
            status: 'SUCCESS',
            durationMs: executionDurationMs,
          });
        }

        logger.info('Tool executed', {
          module: 'ai-agent',
          action: 'tool.execute',
          tool: name,
          agentRunId,
          durationMs: executionDurationMs,
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

        // Fix 4: Log tool execution failures before re-throwing
        logger.warn('Tool execution failed', {
          module: 'ai-agent',
          action: 'tool.execute',
          tool: name,
          agentRunId,
          error: err.message,
        });

        throw err;
      }
    },
    { name, description, schema }
  );
}
