# Stage 1: Build frontend
FROM node:20 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Runtime
FROM python:3.11-slim-bookworm
WORKDIR /app

# Install Node.js 20 binary via Python (no apt-get/xz-tar needed)
COPY <<"PYEOF" /tmp/install_node.py
import urllib.request, tarfile, io
url = "https://registry.npmmirror.com/-/binary/node/v20.20.2/node-v20.20.2-linux-x64.tar.xz"
print("Downloading Node.js...")
data = urllib.request.urlopen(url, timeout=120).read()
print(f"Downloaded {len(data)} bytes, extracting...")
with tarfile.open(fileobj=io.BytesIO(data), mode="r:xz") as tf:
    for m in tf.getmembers():
        m.name = "/".join(m.name.split("/")[1:])
        if m.name:
            tf.extract(m, "/usr/local")
print("Node.js installed.")
PYEOF
RUN python /tmp/install_node.py && rm /tmp/install_node.py && node --version && npm --version

# Install sidecar globally
RUN npm install -g @neteasecloudmusicapienhanced/api

# Install Python dependencies
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

# Copy backend code
COPY backend/ backend/

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist frontend/dist/

# Create data directories
RUN mkdir -p backend/data backend/data/tts_cache

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
