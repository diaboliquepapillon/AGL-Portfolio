#!/usr/bin/env python3
"""Merge PDF files into one. Usage: python3 merge-pdfs.py output.pdf file1.pdf file2.pdf ..."""
import sys

try:
    from pypdf import PdfWriter
except ImportError:
    from PyPDF2 import PdfWriter

def main():
    if len(sys.argv) < 3:
        print("Usage: merge-pdfs.py <output.pdf> <file1.pdf> <file2.pdf> ...", file=sys.stderr)
        sys.exit(1)
    output = sys.argv[1]
    inputs = sys.argv[2:]
    writer = PdfWriter()
    for p in inputs:
        writer.append(p)
    writer.write(output)
    writer.close()
    print(output)

if __name__ == "__main__":
    main()
