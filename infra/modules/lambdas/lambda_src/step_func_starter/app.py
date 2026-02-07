import os, json, urllib.parse
import boto3

SFN_ARN = os.environ["STATE_MACHINE_ARN"]
sfn = boto3.client("stepfunctions")

def handler(event, context):
    for r in event.get("Records", []):
        bucket = r["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(r["s3"]["object"]["key"])
        sfn.start_execution(
            stateMachineArn=SFN_ARN,
            input=json.dumps({"bucket": bucket, "key": key}),
        )
    return {"ok": True}
