import boto3
textract = boto3.client("textract")

def handler(event, context):
    job_id = event["textract"]["job_id"]

    resp = textract.get_document_text_detection(JobId=job_id, MaxResults=1)
    status = resp["JobStatus"]

    if status == "PARTIAL_SUCCESS":
        status = "SUCCEEDED"

    return {"status": status}
