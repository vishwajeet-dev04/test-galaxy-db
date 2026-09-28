# Galaxy Sales Performance Tracker  
## Business Summary

**Product name:** Galaxy Sales Performance Tracker  
**Client:** Galaxy Office Automation (GOAPL)  
**Period covered:** Indian Financial Year 2026–27 (1 April 2026 – 31 March 2027)  
**Document type:** Business overview for leadership, Finance, and operations  
**Last updated:** 20 August 2026

---

## 1. Purpose

Galaxy Sales Performance Tracker is a **role-based sales performance dashboard** for Galaxy Office Automation. It shows, in one place, how the company, each Route-to-Market (RTM) team, each Business Unit, and each Individual Contributor (IC) is tracking against **Finance-owned quota targets**, using **Closed Won deals from Vtiger CRM**.

The product exists so that:

- Leadership can see attainment without waiting for a weekly Excel pack.
- Finance can keep quota targets under their control (H1, H2, and Annual are not auto-calculated).
- Sales ICs, Team Leads, and BU Heads see **only their own numbers**, not the full organisation.
- Actuals stay aligned with CRM, instead of a second copy of the pipeline in spreadsheets.

This is the live performance system for FY 26–27. It is designed to run on **the client’s own server**.

---

## 2. The business problem

Before this system, the operating cycle was:

1. Export Closed Won opportunities from **Vtiger CRM** into Excel.
2. Maintain a separate **Galaxy Quota Tracker** workbook (quotas, actuals, formulas).
3. Re-upload those files so a dashboard could be refreshed.

That process was slow, error-prone, and easy to argue with (“CRM says one number, the Tracker says another”). Names did not always match. H1 / H2 / Annual quotas were sometimes overwritten by Q1–Q4 sums. ICs could see org-wide figures if they logged in.

The Tracker replaces that loop:

| Then | Now |
|------|-----|
| Manual CRM export to Excel | Admin clicks **Sync from Vtiger** |
| Quota Tracker workbook as the live source | Finance / Admin edits quotas in the Admin roster |
| Excel upload to refresh the dashboard | Dashboard rebuilds automatically after sync or quota save |
| One shared view of the company | Login decides what each person can see |

Excel is no longer required at runtime. Quota targets are still **human-owned**; deal actuals are **system-owned**.

---

## 3. What the product does

At a glance, the dashboard answers:

- Are we on track versus quota for this quarter, half, and year?
- Which RTMs (S1, S2, CB, GB, South, GeoX) are contributing?
- How are the five Business Units performing: **DCG, CSN, PS, CSG, Cloud**?
- Which ICs are ahead, and who needs attention?
- Which accounts and brands are driving Closed Won value?
- How does a leader’s team look on **bottomline**?
- What happens to the numbers if we look at a different date range (This Year, This Quarter, Last 90 Days, custom dates)?

All money on screen is in **₹ Crore** (INR ÷ 1,00,00,000).

Attainment is:

**Attainment % = Actuals ÷ Quota × 100**

Status used across RTM / IC views:

| Attainment | Flag |
|------------|------|
| 50% or more | On Track |
| 30% to below 50% | At Risk |
| Below 30% | Critical |

---

## 4. Who uses it

| Role | Typical users | What they see |
|------|----------------|---------------|
| **CEO** | Sanjay | Full organisation. No Admin tools. |
| **Admin** | Dilip, Asif, Dharashini, Praveen (and Anoop as seeded admin) | Full organisation **plus** Admin: Vtiger sync, quota roster, IC transfer between RTMs, Finance T1 import. |
| **Leader / TL** | AVP, BU Head, Team Lead (including Sanjeev Kohli as leader, not as an IC) | Own team / rollup RTM only. Banner: “Showing your login data only”. |
| **Employee (IC)** | Individual Contributors (login like `richat`) | Own numbers only. Overview, RTM, and BU cards are **their** slice, not the company. |

Logins are created from the quota roster (first name + last initial). Privileged accounts are fixed: CEO and Admins.

**Important for go-live:** seeded accounts share a known default password. That password must be changed on the client server. It is a temporary bootstrap, not a production policy.

---

## 5. How the organisation is structured in the product

### 5.1 Routes to Market (RTMs)

Only these six count in RTM / company IC totals:

**S1 → S2 → CB → GB → South → GeoX**

An IC’s RTM comes from the **quota roster**, not from a Division field in Vtiger. If a Closed Won deal is led by someone who is not on the roster, they do not roll into RTM actuals until Finance / Admin adds them (or an alias).

IC transfers between RTMs are **Admin-only**: change the RTM on the roster and Save.

### 5.2 Business Units

Category in CRM maps to BU as follows:

| CRM category | Business Unit |
|--------------|----------------|
| Data Centre | DCG |
| Cyber Security & Networking | CSN |
| Professional Services | PS |
| CSG (EndPoint) | CSG |
| Cloud | Cloud |

Cards on the Business Units page appear in that order: **DCG, CSN, PS, CSG, Cloud**.

### 5.3 Fiscal calendar

Indian FY, April–March.

| Period | Dates |
|--------|--------|
| Q1 | 1 Apr 2026 – 30 Jun 2026 |
| Q2 | 1 Jul 2026 – 30 Sep 2026 |
| Q3 | 1 Oct 2026 – 31 Dec 2026 |
| Q4 | 1 Jan 2027 – 31 Mar 2027 |
| H1 | Q1 + Q2 |
| H2 | Q3 + Q4 |
| Annual | Full FY |

The header date filter defaults to **This Year** (full FY). Changing dates **recomputes actuals** from Closed Won close dates. **Quotas do not change** with the date filter — they stay as Finance uploaded them.

---

## 6. Screens (what leadership will walk through)

| Page | Business use |
|------|----------------|
| **Executive Overview** | Company KPIs, H1/period cards, pipeline mix, people at risk, top attainers. Date range lives in the header. |
| **RTMs** | Each sales motion (S1, S2, CB, GB, South, GeoX) — actual vs quota, status, drill into people. |
| **Business Units** | DCG / CSN / PS / CSG / Cloud performance, counting only what RTM team members closed. |
| **Accounts** | Closed Won by customer — topline, bottomline, mix by BU, deals. |
| **Brands** | Same view by OEM / brand. |
| **Leaders** | Team bottomline view for BU Heads / TLs. |
| **Employees** | IC and Team Lead roster grouped by RTM (TLs carry a TL badge). Heads (AVP, BU Head, Topline, Bottomline) and Sanjeev Kohli are **hidden** here; they appear on Leaders. Each team's total matches its RTMs card. A separate **Self** section (marked "Not an RTM") lists people who sell on their own outside any RTM, e.g. Yusufali Petiwala. Its figures are never added to RTM totals. |
| **Leaderboard** | Ranked attainment by period (Q1–Annual). Q3/Q4 stay thin until H2 deals exist. |
| **Admin** | Vtiger sync, quota roster, BU annual quotas, T1 Excel import, IC add / remove / RTM transfer. CEO does not get this page. |

---

## 7. Two kinds of numbers (this is the Finance contract)

The dashboard is **not** a raw dump of the Vtiger “Closed Won” report. Finance and Sales agreed rules (DevSpec v2). If someone compares the header to a CRM export and the totals differ, that is often **by design**.

### 7.1 IC actuals (Overview, RTM, Employees)

For each person on the quota roster:

- **Q1 / Q2 / Q3 / Q4 actuals** = sum of Closed Won **Amount (topline)** they led in that quarter, in ₹ Cr.
- **H1** = Q1 + Q2 actuals (actuals add; quotas do not have to).
- **GeoX / Hrushikesh Bagade** is measured on **Amount (topline)** like everyone else. There is no longer a bottomline exception. His deals are still left out of the pipeline header totals.

Only people with RTM in S1, S2, CB, GB, South, GeoX roll into **company IC Actuals**.

### 7.2 Quota targets (Finance-owned)

Q1, Q2, Q3, Q4, **H1, H2, and Annual** are stored separately.

**H1 is not forced to equal Q1 + Q2. H2 is not forced to equal Q3 + Q4. Annual is not forced to equal H1 + H2.**

That matches how Finance already maintains the Tracker (example: Riya Bhatt H1 59 vs Q1+Q2 58). Admin cells for H1 / H2 / Annual are marked so editors do not treat them as auto-sum fields.

### 7.3 Three revenue figures on the Overview header

These three must **not** be flattened into one number:

| Label on screen | Meaning |
|-----------------|--------|
| **IC Actuals** | RTM ICs only, DevSpec formula (topline for everyone, including GeoX). |
| **IC Actuals Including Others** | All Closed Won Amount **except Hrushikesh**. |
| **BU mix / donut** | Amount by category from **RTM-team deals only** (S1, S2, CB, GB, South, GeoX, including Hrushikesh). Deals led by BU heads or Self sellers outside the RTMs are left out, so BU totals match the RTM total. |

A full Vtiger Amount total (every Closed Won, every person) will be higher than **IC Actuals**. Example from the August 2026 audit: Q1 CRM Amount **₹117.51 Cr** vs Q1 RTM IC actuals **₹103.72 Cr**. Both are correct; they answer different questions.

### 7.4 Deal “quota credit” (Accounts / Brands / deal rows)

IC actuals stay **raw Amount**. Extra weight is applied only as **quota credit** on the deal:

| Rule | Multiplier |
|------|------------|
| Professional Services — included sub-categories (managed services, SOC, cloud services, automation, deployment, …) | 2.0× |
| PS excluded (residency, Day-2, T&M, 3rd-party AMC, …) | 1.0× |
| CSN | 1.3× |
| DCG Backup & Recovery / Storage | 1.2× |
| Everything else | 1.0× |

**Bottomline** everywhere (Leaders, Accounts, Brands, deal BL) = the total of **Actual Bottomline** from Vtiger. Estimated Bottomline is never used, so a deal with no Actual Bottomline counts as 0 until finance fills it in.

Gross profit % on a deal = bottomline ÷ amount × 100.

---

## 8. Operating model — what is automatic vs what people still do

| Work | Owner | Cadence |
|------|--------|---------|
| Pull Closed Won from Vtiger | Admin (Sync button) | As needed; typically after CRM is current |
| Recalculate actuals, attainment, accounts, brands | System | Every sync or quota save |
| Date-range what-if on actuals | Any logged-in user | Anytime |
| IC quota targets (Q1–Q4, H1, H2, Annual, RTM) | Finance via Admin | Typically twice a year, plus transfers |
| BU annual quotas | Finance via Admin | When the annual plan is locked |
| Name mismatches (CRM “Led By” vs roster name) | Admin / implementation | When a new name appears in CRM |
| Leader / BU Head list | Implementation + Admin | When org chart changes |
| STLY (same time last year), SAM, TAM | **Not in product yet** | Waiting on source data from the client |

Finance can also **download the Galaxy Data Template** and **import sheet T1** (quota roster) instead of typing rows. Sample numbers in the template are **not** auto-applied; import is a deliberate Admin action.

---

## 9. Data flow (business view)

```
Vtiger CRM  (Closed Won opportunities)
      ↓  Admin: Sync from Vtiger
Internal deal store on the client server
      ↓  plus Finance quota roster
Dashboard (Overview, RTM, BU, Accounts, Brands, Leaders, Employees, Leaderboard)
```

- **Actuals** come from CRM.
- **Targets** come from Admin / Finance.
- **Who sees what** comes from login role and the person’s name on the roster.

The client server must be able to reach the **Vtiger** instance used for production CRM. Credentials stay in a local environment file on that server — they are not part of the application package.

---

## 10. Verified snapshot (audit, 18 August 2026)

Independent recompute from CRM-synced deals + Finance quotas. **No IC mismatches. No RTM mismatches.**

| Metric | Result |
|--------|--------|
| Closed Won deals (all) | 474 (Q1 377, Q2 97) |
| Q1 Amount, all deals | ₹117.51 Cr (matches Vtiger report) |
| Q1 RTM IC actuals | ₹103.72 Cr |
| H1 RTM IC actuals | ₹163.98 Cr |
| H1 IC quota | ₹547.5 Cr |
| H1 IC attainment | **29.95%** (At Risk vs the 50% On Track bar — as expected mid-year) |
| IC Actuals Including Others | ₹174.73 Cr |
| RTM ICs on roster | 37 people, all matched |

These figures will move after each Vtiger sync. They prove the **engine** matches Finance rules, not that FY 26–27 is finished.

---

## 11. What is still open with the business

These are product / data gaps, not engineering leftovers:

1. **Cloud vs CSG annual quotas** currently look identical in Admin. Confirm with Finance whether Cloud has its own target.
2. **BU H1 / Q1 quotas** are **derived** from annual BU quotas and the IC mix. If Finance later provides true H1 BU quotas, those should replace the split.
3. **Rima Ingle** has a small amount of Closed Won in CRM but is not on the IC roster, so she is outside RTM totals until Finance adds her.
4. **Q3 / Q4** have no Closed Won yet; those period views are placeholders until H2 trading starts.
5. **Same Time Last Year (STLY), SAM, and TAM** are not shown — no source file has been provided.
6. Leaders page is labelled **Bottomline**; one hero tile still uses the “Including Others” topline. Confirm with product if that tile should switch to team bottomline.

---

## 12. Value delivered

- **Single version of the truth** for FY 26–27 sales performance, aligned to Finance’s DevSpec — not a second CRM.
- **Hours saved** every cycle: no export → Tracker → upload chain for actuals.
- **Governance:** quotas cannot be silently rewritten by Q1–Q4 arithmetic; IC moves between RTMs are Admin-only.
- **Confidentiality:** an IC cannot open Overview and read the whole company’s book.
- **Auditability:** header IC actuals, “Including Others”, and BU mix are three labelled numbers, so Finance and Sales can reconcile instead of arguing.
- **Fit for the client server:** login, sync, quota edit, and reporting all run on GOAPL infrastructure next to Vtiger.

---

## 13. Go-live in one paragraph

Galaxy Sales Performance Tracker is the FY 26–27 sales cockpit for Galaxy Office Automation. Leadership, Finance, and sales roles log in, see the slice of quota and Closed Won that belongs to them, and refresh actuals from Vtiger instead of Excel. Finance remains the owner of targets. CRM remains the owner of Closed Won. The dashboard is the meeting point of the two — on the client’s server, for the full Indian financial year.

---

*This summary is for business stakeholders. Technical runbooks, formulas, and file paths live in `PROJECT_CONTEXT.md` and `README.md`.*
