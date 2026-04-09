import boto3

textract = boto3.client("textract")


def handler(event, context):
    bucket = event["bucket"]
    key = event["key"]

    resp = textract.start_document_text_detection(DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}})

    return {"job_id": resp["JobId"]}
