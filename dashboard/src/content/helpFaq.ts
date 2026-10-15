export interface HelpFaqItem {
  question: string;
  answer: string;
}

export interface HelpFaqSection {
  title: string;
  items: HelpFaqItem[];
}

/**
 * FAQ from Galaxy Performance Tracker User Manual 1.1, section 6.
 * Screen names follow the app, not the PDF: the PDF's "Forgot Password" link and "Admin → Aliases"
 * screen do not exist (Admin maps Vtiger names), and "User Management" is Admin → Users.
 */
export const HELP_FAQ: HelpFaqSection[] = [
  {
    title: "Data and numbers",
    items: [
      {
        question: "Why are there three different revenue totals on the Overview page?",
        answer:
          "Each total measures something different. IC Actuals = RTM ICs and TLs only, BU Heads excluded. Including Others = IC Actuals plus BU Heads, AVPs and Self sellers. BU Donut = amount by category from RTM-team deals only. See the User Manual (section 2.1) for a full explanation.",
      },
      {
        question: "My deal closed in Vtiger but it is not showing on the dashboard.",
        answer:
          "Four possible causes: (1) The sync has not run since you closed the deal — ask Admin. (2) Your deal is not at Closed Won stage. (3) Your Vtiger name does not match the alias list — contact Admin. (4) The deal falls in a quarter that has not been synced yet.",
      },
      {
        question: "Why does my PS deal show a higher quota credit than its invoice value?",
        answer:
          "PS primary focus area deals carry a 2× multiplier. A ₹1 Cr managed services deal counts as ₹2 Cr towards quota credit. The dashboard shows actual revenue on the actuals tiles. See the User Manual (section 2.4).",
      },
      {
        question: "What does Estimated mean on Q3 and Q4?",
        answer:
          "Q3 and Q4 data has not been synced from Vtiger yet. Figures shown are zero or projections. Do not use Estimated figures for formal performance reviews.",
      },
      {
        question: "Why is BU attainment different from RTM attainment for the same period?",
        answer:
          "RTM counts IC and TL deals only. BU counts every deal in that category from RTM-team members. BU Heads’ own deals are excluded from both, so the totals should align.",
      },
      {
        question: "My deal’s Bottomline shows ₹0.00. Why?",
        answer:
          "The dashboard uses only the Actual Bottomline field from Vtiger — not the Estimated Bottomline. If Finance has not yet entered the Actual Bottomline for your deal in Vtiger, it shows ₹0.00 until they do.",
      },
    ],
  },
  {
    title: "My numbers (for ICs)",
    items: [
      {
        question: "Why do I only see my own data?",
        answer:
          "You have a User (IC) role. Overview, RTM and BU cards show only your personal slice. Contact Admin if you need broader access — role changes require management approval.",
      },
      {
        question: "A deal I contributed to is not in my attainment total.",
        answer:
          "Correct — contributed deals (Assigned To, not Led By) appear in your Contributed column only. Only Led By deals count towards attainment.",
      },
      {
        question: "My H2 quota shows “–” or zero.",
        answer: "H2 quotas are set by Finance at the start of the second half. If it is still blank, contact Admin.",
      },
      {
        question: "I was moved to a different RTM. Will my old deals still appear?",
        answer:
          "Yes — deal attribution follows the close date. Deals you led before the move count under your old RTM for those periods; deals after the move count under the new RTM. Your quota history is preserved.",
      },
    ],
  },
  {
    title: "Sync and data freshness",
    items: [
      {
        question: "How often is the dashboard updated?",
        answer:
          "Only when Admin manually runs a Vtiger sync. There is no automatic sync. The last sync timestamp is shown on the Admin sync panel.",
      },
      {
        question: "Can I trigger a sync myself?",
        answer:
          "No — only Admin role users can run a sync. If an urgent update is needed, ask your Admin.",
      },
      {
        question: "The sync ran but my numbers have not changed.",
        answer:
          "No new Closed Won deals were found in Vtiger since the last sync. Check deal stages in Vtiger.",
      },
    ],
  },
  {
    title: "Quota and targets",
    items: [
      {
        question: "I need to update my quota. Who do I contact?",
        answer:
          "Contact Admin. Quota changes are Finance-owned and take effect immediately after saving — no sync required.",
      },
      {
        question: "The quota shown for me is wrong.",
        answer:
          "Contact Admin. Verify against your Target Letter first — the dashboard quota is set directly from Finance’s figures.",
      },
      {
        question: "My annual quota is not equal to H1 + H2 added together.",
        answer:
          "This is correct. H1, H2 and Annual are independent Finance-owned figures. They are not auto-summed. Contact Admin if any of them needs correcting.",
      },
    ],
  },
  {
    title: "Access and roles",
    items: [
      {
        question: "I cannot see the Admin menu.",
        answer: "You do not have the Admin role. Contact Admin if you need this access.",
      },
      {
        question: "I cannot log in.",
        answer: "Contact Admin to reset your password in Admin → Users.",
      },
      {
        question: "My session expired in the middle of my work.",
        answer:
          "Sessions last 2.5 hours. After that you are automatically signed out. Log in again to continue. If your laptop went to sleep, the sign-out happens when you return.",
      },
      {
        question: "I cannot see the Leaders page.",
        answer:
          "The Leaders page is hidden for IC (User) and Team Lead roles. Only Leader, Admin and CEO roles can see it.",
      },
    ],
  },
  {
    title: "Names and rep mapping",
    items: [
      {
        question: "A rep’s actuals show zero even though they have closed deals.",
        answer:
          "Almost always a name alias issue. The rep’s Vtiger name does not match the alias table. Ask Admin to add the correct mapping.",
      },
      {
        question: "A new rep joined. What needs to happen before their deals appear?",
        answer:
          "Admin must: (1) Add them to Admin → Quota roster with RTM division, type and quota figures. (2) Map their Vtiger name to the roster name. (3) Create their login in Admin → Users. Then run a sync.",
      },
      {
        question: "A rep left the company. What happens to their deals?",
        answer:
          "Set them to Inactive in Admin → Quota roster. Do not delete — historical deals are preserved. Their login should also be set to Inactive in Admin → Users.",
      },
    ],
  },
];
