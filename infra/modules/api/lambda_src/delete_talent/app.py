"""
Delete a talent profile and optionally its resume from S3.
"""
import json
import os
import urllib.parse
import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])
s3_client = boto3.client("s3")
RESUME_BUCKET = os.environ.get("RESUME_BUCKET", "")


def handler(event, context):
    try:
        # Get pk from query parameters (path params don't work with slashes in pk)
        query_params = event.get("queryStringParameters") or {}
        pk = query_params.get("pk")
        
        if not pk:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing pk query parameter"}),
            }
        
        # pk is already decoded by API Gateway
        
        # Get the item first to extract the S3 key
        response = table.get_item(Key={"pk": pk})
        item = response.get("Item")
        
        if not item:
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Talent profile not found"}),
            }
        
        # Delete from DynamoDB
        table.delete_item(Key={"pk": pk})
        
        # Delete from S3 if bucket is configured and key exists
        s3_key = item.get("key")
        if RESUME_BUCKET and s3_key:
            try:
                s3_client.delete_object(Bucket=RESUME_BUCKET, Key=s3_key)
            except ClientError as e:
                # Log but don't fail if S3 delete fails
                print(f"Warning: Failed to delete S3 object {s3_key}: {e}")
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "message": "Talent profile deleted successfully",
                "pk": pk,
            }),
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
