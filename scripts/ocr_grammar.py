#!/usr/bin/env python3
"""OCR the grammar PDF into page-labelled text and JSONL using Tesseract."""

import argparse
import json
from pathlib import Path

import pytesseract
from pdf2image import convert_from_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pdf",
        default="source-materials/grammar-chat/grammarbook.pdf",
        help="Path to the source PDF",
    )
    parser.add_argument(
        "--out-dir",
        default="source-materials/grammar-chat",
        help="Directory for OCR output files",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=200,
        help="Rendering DPI (higher is slower but can improve OCR)",
    )
    parser.add_argument(
        "--lang",
        default="nld",
        help="Tesseract language code",
    )
    parser.add_argument(
        "--pages",
        default="",
        help="Optional comma-separated 1-based page numbers, e.g. 1,2,10",
    )
    parser.add_argument("--start", type=int, default=0, help="First page to OCR")
    parser.add_argument("--end", type=int, default=0, help="Last page to OCR")
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append to existing output files instead of overwriting",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    pdf = Path(args.pdf)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    selected = None
    if args.pages:
        selected = [int(value) for value in args.pages.split(",") if value.strip()]

    if selected:
        pages = selected
    elif args.start and args.end:
        pages = list(range(args.start, args.end + 1))
    else:
        from pdf2image import pdfinfo_from_path

        info = pdfinfo_from_path(str(pdf))
        pages = list(range(1, int(info["Pages"]) + 1))

    text_path = out_dir / "grammarbook-ocr.txt"
    jsonl_path = out_dir / "grammarbook-pages.jsonl"
    mode = "a" if args.append else "w"

    with text_path.open(mode, encoding="utf-8") as text_file, jsonl_path.open(
        mode, encoding="utf-8"
    ) as jsonl_file:
        for position, page_number in enumerate(pages, start=1):
            images = convert_from_path(
                str(pdf),
                dpi=args.dpi,
                first_page=page_number,
                last_page=page_number,
            )
            if not images:
                continue
            text = pytesseract.image_to_string(images[0], lang=args.lang).strip()

            text_file.write(f"\n=== PAGE {page_number} ===\n{text}\n")
            jsonl_file.write(
                json.dumps(
                    {"page": page_number, "text": text},
                    ensure_ascii=False,
                )
                + "\n"
            )

            if position % 10 == 0 or position == len(pages):
                print(f"OCR {position}/{len(pages)} pages", flush=True)

    print(f"Wrote {text_path}")
    print(f"Wrote {jsonl_path}")


if __name__ == "__main__":
    main()
