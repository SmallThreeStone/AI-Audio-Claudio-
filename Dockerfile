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

# Use Aliyun Debian mirrors for faster downloads in China
RUN sed -i 's|deb.debian.org|mirrors.cloud.tencent.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's|http://deb.debian.org|http://mirrors.cloud.tencent.com|g' /etc/apt/sources.list

# Install Node.js 20+ for NetEase sidecar
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install sidecar globally (avoid runtime npx downloads)
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

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Start backend (sidecar is auto-managed by sidecar_manager.py)
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
