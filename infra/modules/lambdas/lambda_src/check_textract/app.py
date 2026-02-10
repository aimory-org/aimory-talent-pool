import json
import boto3

textract = boto3.client("textract")

def handler(event, context):
    job_id = event["textract"]["job_id"]

    resp = textract.get_document_text_detection(JobId=job_id, MaxResults=1)
    # Log full response for debugging stuck IN_PROGRESS states.
    print(json.dumps(resp, default=str))
    status = resp["JobStatus"]

    if status == "PARTIAL_SUCCESS":
        status = "SUCCEEDED"

    return {"status": status}
