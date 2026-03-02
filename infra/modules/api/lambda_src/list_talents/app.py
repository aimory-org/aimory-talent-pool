"""
List talents with filtering.
Loads all matching records and filters in Python.
Uses GSIs for efficient primary filtering when available.
"""
import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])

# Map query params to GSI names and key attributes
GSI_MAP = {
    "status": {"index": "status-date-index", "hash_key": "status"},
    "talent_bucket": {"index": "bucket-index", "hash_key": "talent_bucket"},
    "talent_category": {"index": "category-index", "hash_key": "talent_category"},
    "clearance_level": {"index": "clearance-index", "hash_key": "clearance_level"},
    "location_state": {"index": "state-index", "hash_key": "location_state"},
}


class DecimalEncoder(json.JSONEncoder):
    """Handle Decimal types from DynamoDB."""
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


def matches_filters(item, params, used_gsi_key=None):
    """Check if an item matches all the post-fetch filters."""
    # Apply GSI-based filters that weren't used for the primary query
    if used_gsi_key != "status" and params.get("status"):
        if item.get("status") != params["status"]:
            return False
    
    if used_gsi_key != "talent_bucket" and params.get("talent_bucket"):
        if item.get("talent_bucket") != params["talent_bucket"]:
            return False
    
    if used_gsi_key != "talent_category" and params.get("talent_category"):
        if item.get("talent_category") != params["talent_category"]:
            return False
    
    if used_gsi_key != "clearance_level" and params.get("clearance_level"):
        if item.get("clearance_level") != params["clearance_level"]:
            return False
    
    if used_gsi_key != "location_state" and params.get("location_state"):
        if item.get("location_state") != params["location_state"]:
            return False
    
    # Text search on name
    if params.get("search"):
        search_lower = params["search"].lower()
        if search_lower not in item.get("name_lower", ""):
            return False
    
    # Skills filter - must have ALL specified skills
    if params.get("skills"):
        skills = [s.strip() for s in params["skills"].split(",")]
        item_skills = item.get("skill_names", [])
        for skill in skills:
            if skill not in item_skills:
                return False
    
    # Certifications filter - must have ALL specified certs
    if params.get("certifications"):
        certs = [c.strip() for c in params["certifications"].split(",")]
        item_certs = item.get("cert_names", [])
        for cert in certs:
            if cert not in item_certs:
                return False
    
    # Years of experience range (handle None and Decimal)
    years = item.get("years_of_experience")
    if years is None:
        years = 0
    else:
        years = int(years)  # Convert Decimal to int
    
    if params.get("minYears") and years < int(params["minYears"]):
        return False
    if params.get("maxYears") and years > int(params["maxYears"]):
        return False
    
    # City filter
    if params.get("city"):
        if item.get("location", {}).get("city") != params["city"]:
            return False
    
    return True


def handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        
        # Determine which GSI to use (if any)
        gsi_key = None
        gsi_value = None
        for key in GSI_MAP:
            if key in params and params[key]:
                gsi_key = key
                gsi_value = params[key]
                break
        
        # Fetch all matching items
        items = []
        
        if gsi_key:
            # Query using GSI (more efficient)
            gsi_config = GSI_MAP[gsi_key]
            query_params = {
                "IndexName": gsi_config["index"],
                "KeyConditionExpression": Key(gsi_config["hash_key"]).eq(gsi_value),
                "ScanIndexForward": False,  # Most recent first
            }
            
            while True:
                response = table.query(**query_params)
                items.extend(response.get("Items", []))
                if not response.get("LastEvaluatedKey"):
                    break
                query_params["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        else:
            # Full table scan (no GSI filter)
            scan_params = {}
            while True:
                response = table.scan(**scan_params)
                items.extend(response.get("Items", []))
                if not response.get("LastEvaluatedKey"):
                    break
                scan_params["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        
        # Apply post-fetch filters
        filtered_items = [item for item in items if matches_filters(item, params, gsi_key)]
        
        # Sort by date_received descending
        filtered_items.sort(key=lambda x: x.get("date_received", ""), reverse=True)
        
        result = {
            "items": filtered_items,
            "count": len(filtered_items),
        }
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result, cls=DecimalEncoder),
        }
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
