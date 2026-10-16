export function parseBhashiniTranslation(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const response = value as { pipelineResponse?: unknown }
  if (!Array.isArray(response.pipelineResponse)) return null
  const task = response.pipelineResponse.find((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item) && (item as { taskType?: unknown }).taskType === 'translation')
  if (!task || typeof task !== 'object' || Array.isArray(task)) return null
  const output = (task as { output?: unknown }).output
  if (!Array.isArray(output) || !output[0] || typeof output[0] !== 'object' || Array.isArray(output[0])) return null
  const target = (output[0] as { target?: unknown }).target
  return typeof target === 'string' && target.trim().length > 0 && target.length <= 1000 ? target.trim() : null
}
