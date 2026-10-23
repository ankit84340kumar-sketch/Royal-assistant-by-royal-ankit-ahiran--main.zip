"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUploadedFile = parseUploadedFile;
const jszip_1 = __importDefault(require("jszip"));
/**
 * Validates and extracts text content from various file formats securely on the server
 */
async function parseUploadedFile(fileName, mimeType, buffer) {
    const size = buffer.length;
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    // 1. Text-based files (TXT, MD, CSV, JSON, XML, Code files)
    const isCodeOrText = /^(txt|md|csv|json|xml|html|css|js|jsx|ts|tsx|py|c|cpp|h|hpp|cs|java|kt|rs|go|php|rb|sql|sh|yaml|yml|toml|ini|env|log)$/.test(ext) ||
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType === "application/xml";
    if (isCodeOrText) {
        try {
            const text = buffer.toString("utf-8");
            const lines = text.split(/\r?\n/);
            const lineCount = lines.length;
            // Add line numbers for code files
            const isCode = /^(js|jsx|ts|tsx|py|c|cpp|h|hpp|cs|java|kt|rs|go|php|rb|sql|html|css|yaml|yml|toml)$/.test(ext);
            let formattedText = text;
            if (isCode && lineCount < 2000) {
                formattedText = lines
                    .map((line, idx) => `${(idx + 1).toString().padStart(4, " ")} | ${line}`)
                    .join("\n");
            }
            return {
                fileName,
                fileType: ext.toUpperCase() || "Text/Code",
                fileSize: size,
                extractedText: formattedText,
                structureInfo: `${lineCount} lines, ${size} bytes`,
            };
        }
        catch (err) {
            return {
                fileName,
                fileType: ext,
                fileSize: size,
                extractedText: "",
                error: `Text reading failed: ${err?.message || "Encoding error"}`,
            };
        }
    }
    // 2. DOCX (Word Document) - Unzip word/document.xml and parse text
    if (ext === "docx" || mimeType.includes("wordprocessingml")) {
        try {
            const zip = await jszip_1.default.loadAsync(buffer);
            const docXml = zip.file("word/document.xml");
            if (!docXml) {
                return {
                    fileName,
                    fileType: "DOCX",
                    fileSize: size,
                    extractedText: "",
                    error: "Invalid DOCX format: word/document.xml missing.",
                };
            }
            const xmlText = await docXml.async("text");
            // Extract text content from <w:t> tags and preserve paragraph breaks from <w:p>
            const paragraphs = xmlText.split(/<\/w:p>/gi).map((pXml) => {
                const matches = pXml.match(/<w:t[^>]*>(.*?)<\/w:t>/gi) || [];
                return matches
                    .map((t) => t.replace(/<[^>]+>/g, ""))
                    .join("")
                    .trim();
            }).filter(Boolean);
            const fullText = paragraphs.join("\n\n");
            return {
                fileName,
                fileType: "DOCX Word Document",
                fileSize: size,
                extractedText: fullText || "Document appears empty or contains only non-text elements.",
                structureInfo: `${paragraphs.length} paragraphs extracted`,
            };
        }
        catch (err) {
            return {
                fileName,
                fileType: "DOCX",
                fileSize: size,
                extractedText: "",
                error: `Failed to parse DOCX document: ${err?.message || "Corrupted file"}`,
            };
        }
    }
    // 3. XLSX (Excel Spreadsheet) - Unzip xl/sharedStrings.xml & xl/worksheets/sheet1.xml
    if (ext === "xlsx" || mimeType.includes("spreadsheetml")) {
        try {
            const zip = await jszip_1.default.loadAsync(buffer);
            // Load shared strings if available
            let sharedStrings = [];
            const stringsFile = zip.file("xl/sharedStrings.xml");
            if (stringsFile) {
                const stringsXml = await stringsFile.async("text");
                const matches = stringsXml.match(/<t[^>]*>(.*?)<\/t>/gi) || [];
                sharedStrings = matches.map((m) => m.replace(/<[^>]+>/g, ""));
            }
            // Load sheet1
            const sheetFile = zip.file("xl/worksheets/sheet1.xml");
            if (!sheetFile) {
                return {
                    fileName,
                    fileType: "XLSX",
                    fileSize: size,
                    extractedText: "",
                    error: "Worksheet sheet1.xml missing from XLSX archive.",
                };
            }
            const sheetXml = await sheetFile.async("text");
            const rows = sheetXml.split(/<\/row>/gi);
            const parsedRows = [];
            for (const rowXml of rows) {
                const cells = rowXml.match(/<c[^>]*>(.*?)<\/c>/gi) || [];
                const cellValues = [];
                for (const cellXml of cells) {
                    const isShared = cellXml.includes('t="s"');
                    const valMatch = cellXml.match(/<v>(.*?)<\/v>/);
                    if (valMatch) {
                        const rawVal = valMatch[1];
                        if (isShared) {
                            const idx = parseInt(rawVal, 10);
                            cellValues.push(sharedStrings[idx] || rawVal);
                        }
                        else {
                            cellValues.push(rawVal);
                        }
                    }
                }
                if (cellValues.length > 0) {
                    parsedRows.push(cellValues.join("\t|\t"));
                }
            }
            return {
                fileName,
                fileType: "XLSX Spreadsheet",
                fileSize: size,
                extractedText: parsedRows.join("\n"),
                structureInfo: `${parsedRows.length} data rows extracted`,
            };
        }
        catch (err) {
            return {
                fileName,
                fileType: "XLSX",
                fileSize: size,
                extractedText: "",
                error: `Failed to parse XLSX spreadsheet: ${err?.message || "Corrupted file"}`,
            };
        }
    }
    // 4. PDF Documents - Stream & FlateDecode text extraction
    if (ext === "pdf" || mimeType === "application/pdf") {
        try {
            const pdfString = buffer.toString("binary");
            const pageMatches = pdfString.match(/\/Type\s*\/Page\b/g);
            const estimatedPages = pageMatches ? pageMatches.length : 1;
            // Extract text content inside PDF text objects (BT ... ET)
            const textObjects = pdfString.match(/BT[\s\S]*?ET/g) || [];
            const extractedChunks = [];
            for (const obj of textObjects) {
                // Extract string literals ( ... ) Tj and TJ arrays
                const literals = obj.match(/\(([^)]+)\)\s*T[jJ]/g) || [];
                for (const lit of literals) {
                    const cleaned = lit
                        .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
                        .replace(/\\(.)/g, "$1")
                        .replace(/\)\s*T[jJ]$/, "")
                        .replace(/^\(/, "");
                    if (cleaned.trim().length > 0) {
                        extractedChunks.push(cleaned);
                    }
                }
            }
            let fullText = extractedChunks.join(" ");
            // Clean non-printable bytes
            fullText = fullText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ").trim();
            if (!fullText || fullText.length < 20) {
                fullText = `PDF document (${estimatedPages} pages). Text layer was compact or scanned. File size: ${Math.round(size / 1024)} KB.`;
            }
            return {
                fileName,
                fileType: "PDF Document",
                fileSize: size,
                pageCount: estimatedPages,
                extractedText: fullText,
                structureInfo: `Estimated ${estimatedPages} pages`,
            };
        }
        catch (err) {
            return {
                fileName,
                fileType: "PDF",
                fileSize: size,
                extractedText: "",
                error: `Failed to parse PDF: ${err?.message || "Encrypted or corrupted PDF"}`,
            };
        }
    }
    // 5. ZIP Archives - Safe directory inspection & safe file extraction
    if (ext === "zip" || mimeType.includes("zip") || mimeType.includes("compressed")) {
        try {
            const zip = await jszip_1.default.loadAsync(buffer);
            const fileEntries = Object.keys(zip.files);
            // Check zip bomb / path traversal security
            if (fileEntries.length > 300) {
                return {
                    fileName,
                    fileType: "ZIP Archive",
                    fileSize: size,
                    extractedText: "",
                    error: "ZIP archive contains too many entries (max 300 allowed).",
                };
            }
            const fileTreeList = [];
            const extractedTextContents = [];
            for (const entryPath of fileEntries) {
                // Guard path traversal
                if (entryPath.includes("..") || entryPath.startsWith("/")) {
                    continue;
                }
                const zipObj = zip.files[entryPath];
                if (zipObj.dir) {
                    fileTreeList.push(`📁 ${entryPath}`);
                    continue;
                }
                const uncompressed = zipObj._data?.uncompressedSize || 0;
                fileTreeList.push(`📄 ${entryPath} (${uncompressed ? Math.round(uncompressed / 1024) : 0} KB)`);
                // Extract small text/code files inside zip
                const childExt = (entryPath.split(".").pop() || "").toLowerCase();
                const isSafeTextChild = /^(txt|md|json|js|ts|tsx|jsx|py|html|css|csv|yaml|toml|sql|c|cpp|java|kt)$/.test(childExt);
                if (isSafeTextChild && uncompressed < 250 * 1024) {
                    const content = await zipObj.async("text");
                    extractedTextContents.push(`--- FILE: ${entryPath} ---\n${content}\n`);
                }
            }
            const summaryText = `[ZIP ARCHIVE CONTENTS - ${fileEntries.length} files]\n\n` +
                `FILE TREE:\n${fileTreeList.join("\n")}\n\n` +
                `EXTRACTED CODE/TEXT FILES:\n${extractedTextContents.join("\n\n")}`;
            return {
                fileName,
                fileType: "ZIP Project Archive",
                fileSize: size,
                extractedText: summaryText,
                structureInfo: `${fileEntries.length} items in archive`,
            };
        }
        catch (err) {
            return {
                fileName,
                fileType: "ZIP",
                fileSize: size,
                extractedText: "",
                error: `Failed to inspect ZIP archive: ${err?.message || "Corrupted archive"}`,
            };
        }
    }
    // 6. Generic/Media Fallback
    return {
        fileName,
        fileType: mimeType || ext.toUpperCase() || "Binary File",
        fileSize: size,
        extractedText: `Uploaded ${fileName} (${mimeType || ext}, ${Math.round(size / 1024)} KB).`,
        structureInfo: `Binary media / document`,
    };
}
//# sourceMappingURL=documentParser.js.map