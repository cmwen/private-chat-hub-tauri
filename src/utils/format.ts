export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/** Strip common markdown syntax for plain-text display (e.g. conversation titles) */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
    .replace(/\*(.+?)\*/g, '$1')        // *italic*
    .replace(/__(.+?)__/g, '$1')        // __bold__
    .replace(/_(.+?)_/g, '$1')          // _italic_
    .replace(/`(.+?)`/g, '$1')          // `code`
    .replace(/~~(.+?)~~/g, '$1')        // ~~strikethrough~~
    .replace(/^#{1,6}\s+/gm, '')        // # headings
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // [link](url)
    .trim();
}

export function getModelFamily(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('llama')) return 'Llama';
  if (lower.includes('gemma')) return 'Gemma';
  if (lower.includes('mistral')) return 'Mistral';
  if (lower.includes('phi')) return 'Phi';
  if (lower.includes('qwen')) return 'Qwen';
  if (lower.includes('deepseek')) return 'DeepSeek';
  if (lower.includes('codellama') || lower.includes('code')) return 'Code';
  if (lower.includes('vicuna')) return 'Vicuna';
  if (lower.includes('mixtral')) return 'Mixtral';
  return 'Other';
}

export function supportsVision(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return (
    lower.includes('llava') ||
    lower.includes('vision') ||
    lower.includes('bakllava') ||
    (lower.includes('gemma') && lower.includes('3'))
  );
}

export function supportsTools(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return (
    lower.includes('llama3') ||
    lower.includes('llama-3') ||
    lower.includes('mistral') ||
    lower.includes('mixtral') ||
    lower.includes('command-r') ||
    lower.includes('qwen2') ||
    lower.includes('qwen3') ||
    lower.includes('firefunction') ||
    lower.includes('hermes') ||
    lower.includes('nexus')
  );
}

export function supportsCode(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return (
    lower.includes('codellama') ||
    lower.includes('codegemma') ||
    lower.includes('codestral') ||
    lower.includes('deepseek-coder') ||
    lower.includes('starcoder') ||
    lower.includes('qwen2.5-coder') ||
    /\bcode\b/.test(lower)
  );
}

export function getModelCapabilities(modelName: string): string[] {
  const caps: string[] = [];
  if (supportsVision(modelName)) caps.push('vision');
  if (supportsTools(modelName)) caps.push('tools');
  if (supportsCode(modelName)) caps.push('code');
  return caps;
}
