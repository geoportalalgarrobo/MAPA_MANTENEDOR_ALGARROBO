# --- Stage 1: Build Frontend ---
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production Runtime ---
FROM python:3.11-slim-bookworm

# Actualizar e instalar dependencias mínimas si es necesario
RUN apt-get update && apt-get install -y \
    binutils \
    && rm -rf /var/lib/apt/cache/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files
COPY . .

# Copy built frontend from Stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Asegurar directorios de datos
RUN mkdir -p data_tiles data_raw 

# Environment
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

EXPOSE 8080

CMD ["python", "startup.py"]
