#!/bin/bash

# Configuration
PROJECT_DIR="$HOME/projects/driver-micro-services"
OUTPUT_BASE_DIR="$HOME/Documents/vendure"
OUTPUT_FILE="$OUTPUT_BASE_DIR/driver-micro-services_complete_code.txt"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_BASE_DIR"

# Ensure the output file is empty before we start
> "$OUTPUT_FILE"

echo "Exporting driver-micro-services source code to $OUTPUT_FILE"

# Find all relevant source files, excluding directories that are not needed.
# We include: .ts, .js, .json, .cjs, .mjs, .yaml, .yml, .sh, .env*, .config files,
# and any other text-based files that are part of the source.
# We exclude: node_modules, dist, logs, docs, .git, and any binary files.
find "$PROJECT_DIR" \
    -type d \( -name "node_modules" -o -name "dist" -o -name "logs" -o -name "docs" -o -name ".git" \) -prune -o \
    -type f \
    -not -name "*.md" \
    -not -name "*.log" \
    -not -name "*.txt" \
    -not -name "package-lock.json" \
    -not -name "*.png" -not -name "*.jpg" -not -name "*.jpeg" -not -name "*.gif" -not -name "*.ico" \
    -not -name "*.svg" -not -name "*.woff" -not -name "*.woff2" -not -name "*.ttf" -not -name "*.eot" \
    -not -name "*.zip" -not -name "*.tar" -not -name "*.gz" \
    -print0 | while IFS= read -r -d '' file; do
        # Write a header with the file path (relative to PROJECT_DIR for readability)
        relative_path="${file#$PROJECT_DIR/}"
        echo "--- $relative_path ---" >> "$OUTPUT_FILE"
        cat "$file" >> "$OUTPUT_FILE"
        # Add a newline after each file for separation
        echo "" >> "$OUTPUT_FILE"
    done

echo "Export completed."
