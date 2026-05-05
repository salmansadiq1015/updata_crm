export function toMarkdown(content) {
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

export function toPlainText(content) {
  const str = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  return str
    .replace(/```(\w+)\n([\s\S]*?)```/g, (_, lang, code) => `// ${lang}\n${code.trimEnd()}`)
    .replace(/```([\s\S]*?)```/g, (_, code) => code.trimEnd())
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s*/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}
