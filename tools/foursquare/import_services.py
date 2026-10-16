"""
Loads Idaho service businesses from Foursquare's open places dataset
(FSQ OS Places, Apache 2.0) into Bluebird's service_directory table.

Run from the repo root with a Places Portal access token (Places Portal >
OS Places > Access Data > Generate a new access token; tokens last at most a
month) and the Supabase service role key, both read from .env:

    python3 -m venv .fsq && .fsq/bin/pip install "duckdb>=1.4"
    .fsq/bin/python tools/foursquare/import_services.py [--dry-run]

Re-running refreshes names, contact details and categories without touching
claims, hidden flags or looked-up hours and ratings. Businesses Foursquare
has since marked closed, duplicate or nonexistent are hidden.
"""

import json
import sys
import urllib.request
from pathlib import Path

import duckdb

ENV = dict(
    line.split("=", 1)
    for line in Path(".env").read_text().splitlines()
    if "=" in line and not line.lstrip().startswith("#")
)
env = lambda key: ENV.get(key, "").strip().strip('"')

HOME = "Business and Professional Services > Home Improvement Service"
AUTO = "Business and Professional Services > Automotive Service"
BPS = "Business and Professional Services"

# Foursquare category -> Bluebird Services trade. Order matters: a business
# tagged both "General Contractor" and "Plumber" is primarily a plumber.
TRADES = [
    (f"{HOME} > Plumber", "Plumbers"),
    (f"{HOME} > Sewer Contractor", "Plumbers"),
    (f"{HOME} > Electrician", "Electricians"),
    (f"{HOME} > Heating, Ventilating and Air Conditioning Contractor", "Heating & Air Conditioning"),
    (f"{HOME} > Roofer", "Roofing"),
    (f"{HOME} > Pest Control Service", "Pest Control"),
    (f"{HOME} > Tree Service", "Tree Trimming & Removal"),
    (f"{HOME} > Landscaper and Gardener", "Landscape Contractors"),
    (f"{HOME} > Professional Cleaning Service", "House Cleaning"),
    (f"{HOME} > Carpet and Flooring Contractor", "Carpet & Flooring Installation"),
    (f"{HOME} > Painter", "Painters"),
    (f"{HOME} > Carpenter", "Carpentry"),
    (f"{HOME} > Fence Contractor", "Fence Installation & Repair"),
    (f"{HOME} > Deck and Patio Contractor", "Deck & Patio Construction"),
    (f"{HOME} > Garage Door Supplier", "Garage Doors"),
    (f"{HOME} > Swimming Pool Maintenance and Service", "Hot Tub & Pool"),
    (f"{HOME} > Bathroom Contractor", "Remodelers"),
    (f"{HOME} > Kitchen Remodeler", "Remodelers"),
    (f"{HOME} > Mover", "Movers"),
    (f"{HOME} > Home Inspection", "Real Estate Services"),
    (f"{HOME} > Doors and Windows Contractor", "Other Home Services"),
    (f"{HOME} > Chimney Sweep", "Other Home Services"),
    (f"{HOME} > Interior Designer", "Other Home Services"),
    (f"{HOME} > Upholstery Service", "Miscellaneous Services"),
    (f"{HOME} > General Contractor", "General Contractors"),
    (f"{BPS} > Construction", "General Contractors"),
    (f"{HOME} > Home Service", "Other Home Services"),
    (HOME, "Other Home Services"),
    (f"{BPS} > Locksmith", "Other Home Services"),
    (f"{BPS} > Welding Service", "Welding & Fabrication"),
    (f"{BPS} > Computer Repair Service", "Appliance & Electronics Repair"),
    (f"{BPS} > Technology Business > IT Service", "IT Services"),
    (f"{BPS} > Technology Business > Website Designer", "IT Services"),
    (f"{BPS} > Financial Service > Accounting and Bookkeeping Service", "Accounting & Bookkeeping"),
    (f"{BPS} > Legal Service > Law Office", "Legal Services"),
    (f"{BPS} > Legal Service", "Legal Services"),
    (f"{BPS} > Child Care Service > Daycare", "Childcare"),
    (f"{BPS} > Child Care Service", "Childcare"),
    (f"{BPS} > Tutoring Service", "Tutoring"),
    (f"{BPS} > Real Estate Service > Property Management Office", "Real Estate Services"),
    (f"{BPS} > Real Estate Service > Real Estate Appraiser", "Real Estate Services"),
    (f"{BPS} > Real Estate Service > Building and Land Surveyor", "Real Estate Services"),
    (f"{BPS} > Pet Service > Pet Grooming Service", "Pet Care"),
    (f"{BPS} > Pet Service > Pet Sitting and Boarding Service", "Pet Care"),
    (f"{BPS} > Pet Service", "Pet Care"),
    (f"{BPS} > Photography Service > Photographer", "Photography"),
    (f"{BPS} > Photography Service > Photography Studio", "Photography"),
    (f"{BPS} > Tailor", "Miscellaneous Services"),
    (f"{BPS} > Shoe Repair Service", "Miscellaneous Services"),
    (f"{AUTO} > Towing Service", "Automotive"),
    (f"{AUTO} > Car Wash and Detail", "Automotive"),
    (AUTO, "Automotive"),
]


OFFICE_TRADES = {"Legal Services", "Accounting & Bookkeeping", "Real Estate Services",
                 "Childcare", "IT Services", "Tutoring"}
PERSONAL_TRADES = {"Automotive", "Pet Care", "Photography", "Miscellaneous Services",
                   "Appliance & Electronics Repair"}


def priority_for(trade):
    return 3 if trade in OFFICE_TRADES else 2 if trade in PERSONAL_TRADES else 1


# Trades Foursquare has no category for, recognized by clear words in the
# business name. Only applied to businesses already in a service category.
NAME_TRADES = [
    (r"handyman|handy man|fix[- ]?it|honey[- ]?do", "Handyman"),
    (r"drywall|sheetrock", "Drywall"),
    (r"concrete|cement", "Concrete Contractors"),
    (r"gutter", "Gutters & Downspouts"),
    (r"sprinkler|irrigation", "Sprinkler Installation & Repair"),
    (r"window clean", "Window Cleaning"),
    (r"carpet clean|steam clean|upholstery clean", "Carpet Cleaning"),
    (r"junk|hauling|haul away", "Scrap & Junk Removal"),
    (r"masonry|brick|stonework|stone work", "Masonry"),
    (r"excavat|dirt work|earthwork", "Excavation"),
    (r"insulation|insulat", "Insulation"),
    (r"siding", "Siding Installation & Repair"),
    (r"paving|asphalt|sealcoat", "Paving & Asphalt"),
    (r"cabinet|countertop|granite|quartz", "Cabinets & Countertops"),
    (r"\btile\b|marble", "Tile, Marble & Granite Installation"),
    (r"small engine|mower repair|chainsaw", "Small Engine Repair"),
    (r"rv repair|rv service|boat repair|marine service", "RV & Boat Repair"),
    (r"remodel", "Remodelers"),
]
GENERIC_TRADES = {"General Contractors", "Other Home Services", "Miscellaneous Services"}


def trades_for(labels, name=""):
    import re
    by_name = [trade for pattern, trade in NAME_TRADES if re.search(pattern, name or "", re.I)]
    found = []
    for prefix, trade in TRADES:
        exact = prefix in labels
        nested = prefix == AUTO and any(label.startswith(AUTO) for label in labels)
        if (exact or nested) and trade not in found:
            found.append(trade)
    if not found:
        return found
    # A named specialty beats a generic category ("Mr. Fix It" under Home Service).
    if found[0] in GENERIC_TRADES:
        return list(dict.fromkeys(by_name + found))
    return list(dict.fromkeys(found + by_name))


def clean_url(value):
    if not value:
        return None
    value = value.strip()
    if not value.lower().startswith(("http://", "https://")):
        value = "https://" + value
    return value[:300]


def rest(method, path, body=None, prefer=None):
    url = env("SUPABASE_URL").rstrip("/") + "/rest/v1/" + path
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.status


def main():
    dry_run = "--dry-run" in sys.argv
    con = duckdb.connect()
    for extension in ("httpfs", "iceberg"):
        con.execute(f"INSTALL {extension}; LOAD {extension};")
    con.execute(f"CREATE SECRET fsq (TYPE ICEBERG, TOKEN '{env('FOURSQUARE_OS_TOKEN')}')")
    con.execute(
        "ATTACH 'places' AS places (TYPE iceberg, SECRET fsq, "
        "ENDPOINT 'https://catalog.h3-hub.foursquare.com/iceberg')"
    )
    rows = con.execute(
        """
        SELECT fsq_place_id, name, address, locality, region, postcode, latitude, longitude,
               tel, website, email, CAST(facebook_id AS VARCHAR), instagram,
               TRY_CAST(date_refreshed AS DATE), fsq_category_labels,
               date_closed IS NOT NULL
                 OR len(list_filter(coalesce(unresolved_flags, []),
                   f -> f IN ('closed','delete','doesnt_exist','duplicate','privatevenue','inappropriate'))) > 0
        FROM places.datasets.places_os
        WHERE country = 'US' AND region = 'ID'
        """
    ).fetchall()

    keep, gone = [], []
    for (fsq_id, name, address, city, state, postcode, lat, lng, tel, website, email,
         facebook, instagram, refreshed, labels, unusable) in rows:
        trades = trades_for(labels or [], name)
        if not trades:
            continue
        if unusable:
            gone.append(f"fsq-{fsq_id}")
            continue
        # A directory entry is only useful if a customer can reach the business.
        if not city or not name or not (tel or website):
            continue
        keep.append({
            "id": f"fsq-{fsq_id}",
            "name": name[:200],
            "trade": trades[0],
            "priority": priority_for(trades[0]),
            "trades": trades,
            "category_labels": labels,
            "address": address,
            "city": city.strip(),
            "state": state or "ID",
            "postcode": postcode,
            "latitude": lat,
            "longitude": lng,
            "phone": tel,
            "website": clean_url(website),
            "email": email,
            "facebook_id": facebook,
            "instagram": instagram,
            "source_refreshed_at": refreshed.isoformat() if refreshed else None,
        })

    by_trade = {}
    for row in keep:
        by_trade[row["trade"]] = by_trade.get(row["trade"], 0) + 1
    print(f"{len(keep)} businesses to load, {len(gone)} closed or flagged")
    for trade, n in sorted(by_trade.items(), key=lambda item: -item[1]):
        print(f"  {trade}: {n}")
    if dry_run:
        return

    for start in range(0, len(keep), 500):
        rest(
            "POST",
            "service_directory?on_conflict=id",
            keep[start:start + 500],
            "resolution=merge-duplicates,return=minimal",
        )
        print(f"  loaded {min(start + 500, len(keep))}/{len(keep)}")
    for start in range(0, len(gone), 200):
        ids = ",".join(gone[start:start + 200])
        rest(
            "PATCH",
            f"service_directory?id=in.({ids})&claimed_by=is.null",
            {"hidden": True},
            "return=minimal",
        )
    print("done")


if __name__ == "__main__":
    main()
