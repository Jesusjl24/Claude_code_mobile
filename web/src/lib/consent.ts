// Consent wording, exactly as written in SPEC.md. The only variable part is
// the name of the AI assistant, which the builder sets before testers see the
// page: build with  VITE_AI_ASSISTANT_NAME="Name of assistant" npm run build
export const AI_ASSISTANT_PLACEHOLDER = '[AI assistant]';

export function aiAssistantName(): string {
  const name = import.meta.env?.VITE_AI_ASSISTANT_NAME;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : AI_ASSISTANT_PLACEHOLDER;
}

export function consentParagraphs(assistant: string): { heading: string; body: string }[] {
  return [
    {
      heading: 'What this page reads.',
      body: 'Only two things in your export: the accounts whose posts you viewed, with dates, and the list of accounts you follow. It does not open your messages, searches, contacts or photos.',
    },
    {
      heading: 'What leaves your device.',
      body: 'Nothing, until you send it. This page makes one small file with account names, view counts and your goal. You can see what is in it before you send it to me.',
    },
    {
      heading: 'Who sees it.',
      body: `Me. I also paste the account names and your goal into ${assistant}, run by a company overseas, to sort them into groups. I check the result by hand.`,
    },
    {
      heading: 'How long I keep it.',
      body: 'Until the test ends or you ask me to delete it, whichever is first. I keep it that long because I compare it with your second export.',
    },
    {
      heading: 'Your choice.',
      body: "You can stop at any point, and I'll delete your file when you ask.",
    },
  ];
}
