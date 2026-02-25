// Inngest client — singleton used across all functions
import { Inngest } from 'inngest';

export const inngest = new Inngest({
    id: 'owny',
    // Keys are auto-read from INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY env vars
});
