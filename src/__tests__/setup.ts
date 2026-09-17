import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Without this every render stacks up in the same document and queries
// start matching nodes left over from earlier cases.
afterEach(() => cleanup());
