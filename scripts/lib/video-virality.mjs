import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const RULES_PATH = path.join(ROOT, 'config', 'video-virality-rules.json');

export async function loadVideoViralityRules() {
  try {
    return JSON.parse(await fs.readFile(RULES_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export function buildVideoViralityBlock(rules, formatKey) {
  if (!rules) return '';

  const global = rules.global || {};
  const format = rules.formats?.[formatKey] || null;
  const sections = [];

  if (global.preflightQuestions?.length) {
    sections.push(
      'PRE-FLIGHT VIRALITY CHECK — think through these before writing:',
      ...global.preflightQuestions.map((item) => `- ${item}`),
      ''
    );
  }

  if (global.nonNegotiables?.length) {
    sections.push(
      'GLOBAL NON-NEGOTIABLES:',
      ...global.nonNegotiables.map((item) => `- ${item}`),
      ''
    );
  }

  if (global.retentionRules?.length) {
    sections.push(
      'RETENTION RULES:',
      ...global.retentionRules.map((item) => `- ${item}`),
      ''
    );
  }

  if (global.visualRules?.length) {
    sections.push(
      'VISUAL RULES:',
      ...global.visualRules.map((item) => `- ${item}`),
      ''
    );
  }

  if (global.copyRules?.length) {
    sections.push(
      'COPY RULES:',
      ...global.copyRules.map((item) => `- ${item}`),
      ''
    );
  }

  if (format) {
    sections.push(`FORMAT-SPECIFIC RULES — ${formatKey}:`);
    if (format.goal) sections.push(`- Goal: ${format.goal}`);
    if (format.dominantTrigger) sections.push(`- Dominant trigger: ${format.dominantTrigger}`);
    if (format.requiredStructure?.length) {
      sections.push('- Required structure:');
      sections.push(...format.requiredStructure.map((item) => `  - ${item}`));
    }
    if (format.rules?.length) {
      sections.push('- Format rules:');
      sections.push(...format.rules.map((item) => `  - ${item}`));
    }
  }

  return sections.join('\n').trim();
}
