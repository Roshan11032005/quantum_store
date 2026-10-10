/**
 * CopyButton.tsx — Click to copy text to clipboard.
 */

import { useState } from 'react';
import { cn } from '../../utils/cn';

interface CopyButtonProps {
  text: string;
  className?: string;
  label?: string;
}

export function CopyButton({ text, className, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors',
        copied
          ? 'bg-green-100 border-green-400 text-green-700 dark:bg-green-900/20 dark:text-green-300'
          : 'bg-secondary border-border text-muted-foreground hover:text-foreground',
        className
      )}
      aria-label={copied ? 'Copied!' : label}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}
