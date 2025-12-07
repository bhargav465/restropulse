#!/bin/bash
# Compile protobuf schemas for both JavaScript and Python

echo -e "\033[32mCompiling Protocol Buffers...\033[0m"

# Check if protoc is installed
if ! command -v protoc &> /dev/null; then
    echo -e "\033[31mError: protoc compiler not found!\033[0m"
    echo -e "\033[33mPlease install Protocol Buffers compiler:\033[0m"
    echo -e "\033[33m  macOS: brew install protobuf\033[0m"
    echo -e "\033[33m  Linux: apt-get install protobuf-compiler\033[0m"
    exit 1
fi

# Compile for JavaScript (webhook)
echo -e "\n\033[36mCompiling for JavaScript (webhook)...\033[0m"
JS_OUT_DIR="whatsappbusinessapi-webhook/generated"
mkdir -p "$JS_OUT_DIR"

protoc --js_out=import_style=commonjs,binary:"$JS_OUT_DIR" \
       --proto_path=shared-schemas \
       shared-schemas/restropulse.proto

if [ $? -eq 0 ]; then
    echo -e "\033[32m[SUCCESS] JavaScript code generated successfully\033[0m"
else
    echo -e "\033[31m[ERROR] JavaScript compilation failed\033[0m"
    exit 1
fi

# Compile for Python (bot)
echo -e "\n\033[36mCompiling for Python (bot)...\033[0m"
PY_OUT_DIR="whatsappbusinessapi-bot/generated"
mkdir -p "$PY_OUT_DIR"

protoc --python_out="$PY_OUT_DIR" \
       --proto_path=shared-schemas \
       shared-schemas/restropulse.proto

if [ $? -eq 0 ]; then
    echo -e "\033[32m[SUCCESS] Python code generated successfully\033[0m"
    
    # Create __init__.py to make it a Python package
    touch "$PY_OUT_DIR/__init__.py"
else
    echo -e "\033[31m[ERROR] Python compilation failed\033[0m"
    exit 1
fi

# Generate Mongoose schemas
echo -e "\n\033[36mGenerating Mongoose schemas...\033[0m"
node scripts/generate-mongoose-schemas.js
if [ $? -eq 0 ]; then
    echo -e "\033[32m[SUCCESS] Mongoose schemas generated successfully\033[0m"
else
    echo -e "\033[31m[ERROR] Mongoose schema generation failed\033[0m"
    exit 1
fi

# Generate PyMongo schemas
echo -e "\n\033[36mGenerating PyMongo schemas...\033[0m"
python scripts/generate-pymongo-schemas.py
if [ $? -eq 0 ]; then
    echo -e "\033[32m[SUCCESS] PyMongo schemas generated successfully\033[0m"
else
    echo -e "\033[31m[ERROR] PyMongo schema generation failed\033[0m"
    exit 1
fi

echo -e "\n\033[32m[SUCCESS] All schemas generated successfully!\033[0m"
echo -e "\033[36mGenerated files:\033[0m"
echo -e "\033[90m  - $JS_OUT_DIR/restropulse_pb.js\033[0m"
echo -e "\033[90m  - $JS_OUT_DIR/mongoose-schemas.js\033[0m"
echo -e "\033[90m  - $PY_OUT_DIR/restropulse_pb2.py\033[0m"
echo -e "\033[90m  - $PY_OUT_DIR/pymongo_schemas.py\033[0m"
