FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONPATH=/app
EXPOSE 5001 50051
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${LLM_PROVIDER_HTTP_PORT:-5001} --workers 2 --threads 4 src.http_app:app & exec python -m src.grpc_main"]
