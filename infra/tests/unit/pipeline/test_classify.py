"""Tests for classify Lambda."""

import io
import xml.etree.ElementTree as ET
import zipfile

import boto3
import pytest
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/pipeline/lambda_src/classify")


def _make_docx_bytes(text="Jane Doe Senior Developer Python AWS"):
    """Create a minimal .docx (ZIP containing word/document.xml)."""
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    root = ET.Element(f"{{{ns}}}document")
    body = ET.SubElement(root, f"{{{ns}}}body")
    para = ET.SubElement(body, f"{{{ns}}}p")
    run = ET.SubElement(para, f"{{{ns}}}r")
    t = ET.SubElement(run, f"{{{ns}}}t")
    t.text = text

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("word/document.xml", ET.tostring(root, encoding="unicode"))
    return buf.getvalue()


def _setup_s3_with_file(key, body):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="test-resume-bucket")
    s3.put_object(Bucket="test-resume-bucket", Key=key, Body=body)
    return s3


class TestClassifyDocx:
    def test_docx_skip_textract(self, aws_mocks):
        body = _make_docx_bytes("Senior Developer with 10 years of Python experience")
        _setup_s3_with_file("raw/resume.docx", body)
        app = _reload_app()

        result = app.handler({"bucket": "test-resume-bucket", "key": "raw/resume.docx"}, None)
        assert result["doc_type"] == "word"
        assert result["extension"] == "docx"
        assert result["skip_textract"] is True
        assert result["direct_text"] is not None

    def test_docx_extracts_text(self, aws_mocks):
        body = _make_docx_bytes("Hello World Resume Content")
        _setup_s3_with_file("raw/resume.docx", body)
        app = _reload_app()

        result = app.handler({"bucket": "test-resume-bucket", "key": "raw/resume.docx"}, None)
        assert "Hello World" in result["direct_text"]


class TestClassifyPdf:
    def test_pdf_with_pdfminer(self, aws_mocks, monkeypatch):
        """If pdfminer extracts readable text >= threshold, skip textract."""
        app = _reload_app()

        # Mock pdfminer to return readable text above threshold
        readable = "a" * 1500  # above MIN_PDF_TEXT_CHARS=1000
        monkeypatch.setattr(app, "pdf_extract_text", lambda f: readable)

        _setup_s3_with_file("raw/resume.pdf", b"%PDF-1.4 fake")

        result = app.handler({"bucket": "test-resume-bucket", "key": "raw/resume.pdf"}, None)
        assert result["doc_type"] == "pdf"
        assert result["skip_textract"] is True
        assert result["direct_text"] == readable

    def test_pdf_unreadable_needs_textract(self, aws_mocks, monkeypatch):
        """If pdfminer returns garbage, skip_textract should be False."""
        app = _reload_app()

        # Return mostly non-printable content
        garbage = "\x00\x01\x02" * 100
        monkeypatch.setattr(app, "pdf_extract_text", lambda f: garbage)

        _setup_s3_with_file("raw/scan.pdf", b"%PDF-1.4 scanned")

        result = app.handler({"bucket": "test-resume-bucket", "key": "raw/scan.pdf"}, None)
        assert result["skip_textract"] is False
        assert result["direct_text"] is None

    def test_pdf_below_char_threshold_needs_textract(self, aws_mocks, monkeypatch):
        """Readable but too short — needs textract."""
        app = _reload_app()
        short_text = "Short text" * 10  # well below 1000 readable chars
        monkeypatch.setattr(app, "pdf_extract_text", lambda f: short_text)

        _setup_s3_with_file("raw/short.pdf", b"%PDF-1.4")

        result = app.handler({"bucket": "test-resume-bucket", "key": "raw/short.pdf"}, None)
        assert result["skip_textract"] is False


class TestClassifyUnsupported:
    def test_unsupported_extension_raises(self, aws_mocks):
        _setup_s3_with_file("raw/file.txt", b"text")
        app = _reload_app()
        with pytest.raises(ValueError, match="Unsupported file type"):
            app.handler({"bucket": "test-resume-bucket", "key": "raw/file.txt"}, None)

    def test_no_extension_raises(self, aws_mocks):
        _setup_s3_with_file("raw/noext", b"data")
        app = _reload_app()
        with pytest.raises(ValueError, match="Unsupported file type"):
            app.handler({"bucket": "test-resume-bucket", "key": "raw/noext"}, None)


class TestClassifyHelpers:
    def test_is_text_readable_good(self):
        app = _reload_app()
        assert app._is_text_readable("Hello World this is a good resume with letters 12345") is True

    def test_is_text_readable_empty(self):
        app = _reload_app()
        assert app._is_text_readable("") is False

    def test_is_text_readable_garbage(self):
        app = _reload_app()
        assert app._is_text_readable("\x00\x01\x02\x03\x04" * 50) is False

    def test_count_readable_chars(self):
        app = _reload_app()
        assert app._count_readable_chars("Hello World") == 10  # no spaces
