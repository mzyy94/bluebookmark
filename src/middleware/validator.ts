import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { cursorPattern, parseCursor } from '../xrpc/cursor';

// ref. https://github.com/bluesky-social/atproto/blob/fcf8e3faf311559162c3aa0d9af36f84951914bc/lexicons/app/bsky/feed/getFeedSkeleton.json
export const validateQuery = zValidator(
  'query',
  z.object({
    feed: z.string(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().regex(cursorPattern).transform(parseCursor).optional(),
  }),
);
