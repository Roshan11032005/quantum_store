/**
 * ByteSize.tsx — Human-readable file size display.
 */

import { formatBytes } from '../../utils/format';

interface ByteSizeProps {
  bytes: number;
  decimals?: number;
  className?: string;
}

export function ByteSize({ bytes, decimals = 2, className }: ByteSizeProps) {
  return <span className={className} title={`${bytes.toLocaleString()} bytes`}>{formatBytes(bytes, decimals)}</span>;
}
