"""
Behaviorally-informed outreach message templates.

Principles applied (based on Cialdini + behavioural economics):
  - Reciprocity:   offer genuine value upfront (market insight, no strings attached)
  - Social proof:  reference others in similar positions who have transitioned well
  - Scarcity:      acknowledge their time is scarce; keep asks tiny ("just 20 minutes")
  - Liking:        personalise to their specific business and sector
  - Unity:         position as fellow business person, not predator

All templates are used by the Outreach Agent as STARTING POINTS.
Claude then personalises each one to the specific listing before human review.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Template:
    name: str
    subject: str
    body: str


INITIAL_TEMPLATES = [
    Template(
        name="retiring_owner_coffee",
        subject="Your {sector} business — serious buyer, no broker",
        body="""Hi {contact_name},

I came across your listing for {business_name} and wanted to reach out directly — no broker, no middleman, just me.

I'm a private buyer focused exclusively on well-run {sector} businesses in {state}. What drew me to yours is {personalised_hook}.

I'm not here to kick tyres. I have capital ready and I'm looking to move on the right opportunity within the next few months. My goal is always a transition that works for the seller — I know how much goes into building something like this, and I want to honour that.

If you're open to it, I'd love to grab a 20-minute coffee — or even a phone call — just to introduce myself and understand what an ideal outcome looks like for you. No pressure, no obligations.

Would that work for you?

Best,
{sender_name}
{sender_phone}""",
    ),
    Template(
        name="no_succession_empathy",
        subject="Re: {business_name} — private buyer interested",
        body="""Hi {contact_name},

I saw your listing and wanted to write personally rather than go through an agent.

Transitioning a business you've spent years building — especially without a natural successor in the family — is genuinely hard. I've spoken with a number of owners in exactly that position, and the ones who've had the smoothest outcomes are the ones who found the right buyer early, before they were under pressure.

I'm a private buyer with a genuine interest in {sector} businesses in {state}. I work directly with sellers, structure deals that are flexible (including vendor finance where it helps both sides), and I'm serious about long-term stewardship of what you've built.

I'm not in a rush, and neither do I need you to be. I'd just like to introduce myself.

Could we find 20 minutes for a call this week or next?

Regards,
{sender_name}
{sender_phone}""",
    ),
    Template(
        name="absentee_management_angle",
        subject="{business_name} — quick question from a serious buyer",
        body="""Hi {contact_name},

I came across your business listing and one thing stood out to me: it's clear you've built something that runs without needing you there every day. That's rare, and it's exactly what I look for.

I'm a private buyer focused on businesses in {state} in sectors like {sector} — specifically ones with strong systems and good teams already in place. Yours fits that profile well.

I have a simple process: brief intro call, then if there's mutual interest, I move quickly. No agents, no lengthy processes, no tyre-kicking.

Would you be open to a 20-minute coffee or phone call to explore whether this could be a fit?

Best,
{sender_name}
{sender_phone}""",
    ),
]

FOLLOW_UP_TEMPLATES = [
    Template(
        name="follow_up_1_gentle",
        subject="Re: {business_name} — following up",
        body="""Hi {contact_name},

I just wanted to follow up on my note from last week. I imagine you're fielding a few enquiries, so I'll keep this brief.

I'm still very interested in {business_name} and I'd love to connect when the timing works for you.

Happy to work around your schedule — even a 10-minute call would be a great start.

Best,
{sender_name}""",
    ),
    Template(
        name="follow_up_2_value_add",
        subject="Something that might be useful — re: {business_name}",
        body="""Hi {contact_name},

I've been thinking about your situation since I first reached out, and I wanted to share something that might be genuinely useful — regardless of whether we end up doing business together.

A number of business owners I've spoken with have found it helpful to get a preliminary view on what a structured deal might look like for their specific circumstances (timing of payments, tax treatment, potential for them to stay involved as an advisor). Happy to walk you through what that could look like for {business_name} — no cost, no obligation.

Still very interested in having a conversation if you're open to it.

Best,
{sender_name}
{sender_phone}""",
    ),
    Template(
        name="follow_up_3_final",
        subject="Last note — {business_name}",
        body="""Hi {contact_name},

I won't keep filling up your inbox — this will be my last follow-up.

I'm still very keen on {business_name} and believe I could offer a straightforward, respectful process for you. If circumstances change or the timing becomes right, please don't hesitate to reach out.

I wish you all the best with whatever path you choose.

Warmly,
{sender_name}
{sender_phone}""",
    ),
]
