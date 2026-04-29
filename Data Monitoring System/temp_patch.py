from pathlib import Path
path = Path("core.js")
text = path.read_text("utf-8")
old = "const unit = parts[2] || 'D'; // Default to days if unit not provided"
new = "const unitRaw = parts[2] || 'D'; // Default to days if unit not provided\n                const unit = unitRaw.replace(/^['\"]|['\"]$/g, '').trim().toUpperCase() || 'D';"
if old not in text:
    raise SystemExit('Old string not found')
text = text.replace(old, new)
path.write_text(text, "utf-8")
print('replaced')
