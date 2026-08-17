#!/usr/bin/env python3
"""
Vtiger CRM Field Discovery Script
===================================
Run this once to discover the exact field names in your Vtiger Potentials module
and map them to the pipeline columns the Quota Tracker expects.

Usage:
    python scripts/vtiger_discover.py --url http://crmgoaplpoc.centralindia.cloudapp.azure.com \
                                       --username admin \
                                       --accesskey YOUR_ACCESS_KEY_HERE

How to find your Access Key in Vtiger:
    1. Log into Vtiger
    2. Click your username (top-right) → My Preferences
    3. Scroll to "User Advanced Options" section
    4. Copy the "Access Key" value (long alphanumeric string)
"""

import argparse
import hashlib
import json
import sys
import urllib.parse
import urllib.request


def vtiger_request(base_url, params):
    url = f"{base_url}/webservice.php?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  ERROR calling {params.get('operation')}: {e}", file=sys.stderr)
        return None


def vtiger_post(base_url, params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"{base_url}/webservice.php", data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  ERROR posting {params.get('operation')}: {e}", file=sys.stderr)
        return None


def login(base_url, username, access_key):
    print(f"\n[1] Getting challenge token for '{username}'...")
    challenge = vtiger_request(base_url, {"operation": "getchallenge", "username": username})
    if not challenge or not challenge.get("success"):
        print("  FAILED to get challenge token.", file=sys.stderr)
        return None

    token = challenge["result"]["token"]
    print(f"  Token: {token}")

    key_md5 = hashlib.md5((token + access_key).encode()).hexdigest()
    print(f"\n[2] Logging in...")
    result = vtiger_post(base_url, {
        "operation": "login",
        "username": username,
        "accessKey": key_md5,
    })
    if not result or not result.get("success"):
        err = result.get("error", {}) if result else {}
        print(f"  LOGIN FAILED: {err.get('message', 'Unknown error')}", file=sys.stderr)
        print("  Check your access key (web password won't work — you need the API access key from your Vtiger profile)", file=sys.stderr)
        return None

    session = result["result"]["sessionName"]
    print(f"  Session: {session}")
    return session


def discover_modules(base_url, session):
    print("\n[3] Listing all CRM modules...")
    resp = vtiger_request(base_url, {"operation": "listtypes", "sessionName": session})
    if not resp or not resp.get("success"):
        print("  Could not list modules.")
        return []
    types = resp["result"]["types"]
    print(f"  Found {len(types)} modules: {', '.join(types[:15])}{'...' if len(types) > 15 else ''}")
    return types


def describe_module(base_url, session, module):
    resp = vtiger_request(base_url, {
        "operation": "describe",
        "sessionName": session,
        "elementType": module,
    })
    if not resp or not resp.get("success"):
        return None
    return resp["result"]


def fetch_sample(base_url, session, module, limit=2):
    query = f"SELECT * FROM {module} WHERE sales_stage='Closed Won' LIMIT {limit};"
    resp = vtiger_request(base_url, {
        "operation": "query",
        "sessionName": session,
        "query": query,
    })
    if resp and resp.get("success"):
        return resp["result"]
    # Try without filter if Potentials has no sales_stage
    query2 = f"SELECT * FROM {module} LIMIT {limit};"
    resp2 = vtiger_request(base_url, {
        "operation": "query",
        "sessionName": session,
        "query": query2,
    })
    if resp2 and resp2.get("success"):
        return resp2["result"]
    return []


def main():
    parser = argparse.ArgumentParser(description="Vtiger CRM field discovery")
    parser.add_argument("--url", required=True, help="Base Vtiger URL (no trailing slash)")
    parser.add_argument("--username", required=True, help="Vtiger admin username")
    parser.add_argument("--accesskey", required=True, help="Vtiger API access key (from My Preferences)")
    args = parser.parse_args()

    base = args.url.rstrip("/")

    # Step 1: Login
    session = login(base, args.username, args.accesskey)
    if not session:
        sys.exit(1)

    # Step 2: List modules
    modules = discover_modules(base, session)

    # Step 3: Focus on Potentials (Opportunities)
    print("\n[4] Describing 'Potentials' module (Opportunities)...")
    desc = describe_module(base, session, "Potentials")
    if not desc:
        print("  Could not describe Potentials module.")
    else:
        fields = desc.get("fields", [])
        print(f"  Found {len(fields)} fields:\n")

        # Pipeline column mapping — what we need
        NEEDED = {
            "Opportunity Led By": None,   # col F — rep name match key
            "Category": None,             # col K — Data Centre / CSG etc.
            "Amount": None,               # col O — topline revenue
            "Estimated Bottomline": None, # col P — GP estimate
            "Actual Bottomline": None,    # col Q — actual GP
            "Division": None,             # col Z — RTM division tag
            "Sub Category": None,
            "Brand": None,
            "Deal Status": None,
            "OPF No.": None,
            "Opportunity Number": None,
            "Organization Name": None,
            "Contact Name": None,
            "Sales Stage": None,
            "Expected Close Date": None,
            "Deal Category": None,
            "Probability": None,
        }

        print(f"  {'Field Name (API)':<40} {'Label':<35} {'Type':<20}")
        print(f"  {'-'*40} {'-'*35} {'-'*20}")
        for f in sorted(fields, key=lambda x: x.get("name", "")):
            name = f.get("name", "")
            label = f.get("label", "")
            ftype = f.get("type", {}).get("name", "")
            print(f"  {name:<40} {label:<35} {ftype:<20}")
            # Try to match to our needed fields
            for needed_label in NEEDED:
                if needed_label.lower() in label.lower() or needed_label.lower() in name.lower():
                    NEEDED[needed_label] = name

        print("\n  --- PIPELINE COLUMN MAPPING ---")
        print(f"  {'Excel Column':<30} {'Needed Label':<30} {'Vtiger API Field'}")
        print(f"  {'-'*30} {'-'*30} {'-'*30}")
        col_map = {
            "F": "Opportunity Led By",
            "K": "Category",
            "O": "Amount / Topline",
            "P": "Estimated Bottomline",
            "Q": "Actual Bottomline",
            "Z": "Division",
        }
        for col, label in col_map.items():
            vtiger_field = NEEDED.get(label, NEEDED.get("Amount", "NOT FOUND"))
            if label == "Amount / Topline":
                vtiger_field = NEEDED.get("Amount", "NOT FOUND")
            print(f"  Col {col} ({label:<25}) → {vtiger_field or 'NOT FOUND — check custom fields'}")

        missing = [k for k, v in NEEDED.items() if v is None]
        if missing:
            print(f"\n  ⚠  Fields NOT automatically matched (likely custom fields):")
            for m in missing:
                print(f"     - {m}")
            print("  These will appear in the full field list above with 'cf_' prefix.")

    # Step 4: Fetch a sample closed-won deal
    print("\n[5] Fetching 2 sample Closed Won deals from Potentials...")
    samples = fetch_sample(base, session, "Potentials")
    if samples:
        print(f"  Got {len(samples)} sample record(s). Showing all keys:\n")
        for i, rec in enumerate(samples):
            print(f"  --- Record {i+1} ---")
            for k, v in sorted(rec.items()):
                if v and str(v).strip() not in ("", "0", "0.0"):
                    print(f"    {k:<45} = {str(v)[:80]}")
    else:
        print("  No Closed Won deals found in sample query.")

    # Step 5: Check what users exist (for 'Opportunity Led By' mapping)
    print("\n[6] Fetching sales user list (Users module)...")
    users_resp = vtiger_request(base, {
        "operation": "query",
        "sessionName": session,
        "query": "SELECT id, user_name, first_name, last_name, email1 FROM Users LIMIT 50;",
    })
    if users_resp and users_resp.get("success"):
        users = users_resp["result"]
        print(f"  Found {len(users)} users:")
        for u in users:
            full = f"{u.get('first_name','')} {u.get('last_name','')}".strip()
            print(f"    {u.get('user_name',''):<20} → '{full}' ({u.get('email1','')})")
    else:
        print("  Could not fetch users.")

    print("\n[7] Done. Save this output — it shows the exact Vtiger field names.")
    print("    Copy the 'Vtiger API Field' column to share with your dev team.\n")


if __name__ == "__main__":
    main()
