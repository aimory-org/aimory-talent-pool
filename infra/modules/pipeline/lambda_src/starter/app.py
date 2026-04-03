import json
import os
import urllib.parse

import boto3

PARAM_NAME = os.environ["SFN_ARN_PARAM"]
RAW_PREFIX = os.environ.get("RAW_PREFIX", "raw/")

ssm = boto3.client("ssm")
sfn = boto3.client("stepfunctions")

def handler(event, context):
    sfn_arn = ssm.get_parameter(Name=PARAM_NAME)["Parameter"]["Value"]

    for r in event.get("Records", []):
        bucket = r["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(r["s3"]["object"]["key"])

        if not key.startswith(RAW_PREFIX):
            continue

        sfn.start_execution(
            stateMachineArn=sfn_arn,
            input=json.dumps({"bucket": bucket, "key": key}),
        )

    return {"ok": True}
