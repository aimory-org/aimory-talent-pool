variable "project_name" { type = string }
variable "environment" { type = string }

variable "lambda_arns" {
  type = object({
    classify       = string
    start_textract = string
    check_textract = string
    fetch_textract = string
    normalize      = string
    llm_extract    = string
    persist        = string
  })
}
