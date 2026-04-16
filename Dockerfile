FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml README.md requirements.lock ./
COPY app ./app
RUN pip install --no-cache-dir -r requirements.lock \
    && pip install --no-cache-dir --no-deps .

EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
